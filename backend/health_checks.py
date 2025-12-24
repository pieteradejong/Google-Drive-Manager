"""Health checks and validation for the Drive index.

This module provides validation checks to detect data corruption or drift:
- Dangling edges (parent/child references to missing files)
- Unresolved shortcuts (shortcuts pointing to missing targets)
- Cycle detection (folders containing themselves)
- Basic statistics and counts

Run these after crawl/sync to validate data integrity.
"""

from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from .index_db import (
    get_connection,
    get_db_path,
)
from .utils.logger import PerformanceLogger

# Performance logger
health_logger = PerformanceLogger("health_checks")


class HealthCheckResult:
    """Result of health check operations."""

    def __init__(self):
        self.passed: bool = True
        self.warnings: List[str] = []
        self.errors: List[str] = []
        self.stats: Dict[str, Any] = {}
        self.details: Dict[str, Any] = {}

    def add_warning(self, message: str):
        self.warnings.append(message)

    def add_error(self, message: str):
        self.errors.append(message)
        self.passed = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "warnings": self.warnings,
            "errors": self.errors,
            "stats": self.stats,
            "details": self.details,
        }


def check_dangling_edges(conn) -> Dict[str, Any]:
    """
    Find parent-child edges where parent or child is missing.

    Returns:
        Dict with:
        - missing_parents: List of (child_id, parent_id) where parent is missing
        - missing_children: List of (parent_id, child_id) where child is missing
        - orphaned_files: Files with no parents that aren't root items
    """
    cursor = conn.cursor()

    # Find edges where parent_id doesn't exist in files table
    cursor.execute(
        """
        SELECT p.child_id, p.parent_id
        FROM parents p
        LEFT JOIN files f ON p.parent_id = f.id
        WHERE f.id IS NULL
    """
    )
    missing_parents = [(row["child_id"], row["parent_id"]) for row in cursor.fetchall()]

    # Find edges where child_id doesn't exist in files table
    cursor.execute(
        """
        SELECT p.parent_id, p.child_id
        FROM parents p
        LEFT JOIN files f ON p.child_id = f.id
        WHERE f.id IS NULL
    """
    )
    missing_children = [
        (row["parent_id"], row["child_id"]) for row in cursor.fetchall()
    ]

    # Find files with no parent edges (potential orphans)
    # Note: Root-level items legitimately have no parents
    cursor.execute(
        """
        SELECT f.id, f.name, f.mime_type
        FROM files f
        LEFT JOIN parents p ON f.id = p.child_id
        WHERE p.child_id IS NULL
          AND f.removed = 0
          AND f.trashed = 0
    """
    )
    orphaned_files = [dict(row) for row in cursor.fetchall()]

    return {
        "missing_parents": missing_parents,
        "missing_children": missing_children,
        "orphaned_files": orphaned_files,
        "missing_parent_count": len(missing_parents),
        "missing_child_count": len(missing_children),
        "orphan_count": len(orphaned_files),
    }


def check_unresolved_shortcuts(conn) -> Dict[str, Any]:
    """
    Find shortcuts where the target file doesn't exist locally.

    Returns:
        Dict with:
        - unresolved: List of shortcuts with missing targets
        - resolved: Count of shortcuts with valid targets
    """
    cursor = conn.cursor()

    # Find shortcuts with missing targets
    cursor.execute(
        """
        SELECT s.id, s.name, s.shortcut_target_id
        FROM files s
        LEFT JOIN files t ON s.shortcut_target_id = t.id AND t.removed = 0
        WHERE s.is_shortcut = 1
          AND s.removed = 0
          AND s.trashed = 0
          AND t.id IS NULL
    """
    )
    unresolved = [dict(row) for row in cursor.fetchall()]

    # Count resolved shortcuts
    cursor.execute(
        """
        SELECT COUNT(*) as count
        FROM files s
        JOIN files t ON s.shortcut_target_id = t.id AND t.removed = 0
        WHERE s.is_shortcut = 1
          AND s.removed = 0
          AND s.trashed = 0
    """
    )
    resolved_count = cursor.fetchone()["count"]

    return {
        "unresolved": unresolved,
        "unresolved_count": len(unresolved),
        "resolved_count": resolved_count,
    }


def check_folder_cycles(conn) -> Dict[str, Any]:
    """
    Detect cycles in folder containment graph.

    A cycle would mean a folder contains itself through some chain,
    which shouldn't happen in a valid Drive structure.

    Returns:
        Dict with:
        - cycles: List of cycle chains (lists of folder IDs)
        - has_cycles: Boolean
    """
    cursor = conn.cursor()

    # Get all folders
    cursor.execute(
        """
        SELECT id FROM files
        WHERE mime_type = 'application/vnd.google-apps.folder'
          AND removed = 0
          AND trashed = 0
    """
    )
    folder_ids = {row["id"] for row in cursor.fetchall()}

    # Build adjacency map (parent -> children)
    cursor.execute(
        """
        SELECT parent_id, child_id FROM parents
    """
    )
    children_map = defaultdict(list)
    for row in cursor.fetchall():
        if row["parent_id"] in folder_ids and row["child_id"] in folder_ids:
            children_map[row["parent_id"]].append(row["child_id"])

    # DFS to detect cycles
    cycles = []
    visited = set()
    rec_stack = set()

    def dfs(node: str, path: List[str]) -> bool:
        visited.add(node)
        rec_stack.add(node)
        path.append(node)

        for child in children_map.get(node, []):
            if child not in visited:
                if dfs(child, path):
                    return True
            elif child in rec_stack:
                # Found a cycle
                cycle_start = path.index(child)
                cycles.append(path[cycle_start:] + [child])
                return True

        path.pop()
        rec_stack.remove(node)
        return False

    for folder_id in folder_ids:
        if folder_id not in visited:
            dfs(folder_id, [])

    return {
        "cycles": cycles,
        "has_cycles": len(cycles) > 0,
        "cycle_count": len(cycles),
    }


def get_stats(conn) -> Dict[str, Any]:
    """
    Get basic statistics about the indexed data.

    Returns:
        Dict with counts by type, size info, etc.
    """
    cursor = conn.cursor()

    # Total files (non-removed)
    cursor.execute("SELECT COUNT(*) as count FROM files WHERE removed = 0")
    total_files = cursor.fetchone()["count"]

    # Trashed files
    cursor.execute(
        "SELECT COUNT(*) as count FROM files WHERE removed = 0 AND trashed = 1"
    )
    trashed_count = cursor.fetchone()["count"]

    # Non-trashed files
    cursor.execute(
        "SELECT COUNT(*) as count FROM files WHERE removed = 0 AND trashed = 0"
    )
    active_count = cursor.fetchone()["count"]

    # Folders
    cursor.execute(
        """
        SELECT COUNT(*) as count FROM files
        WHERE removed = 0 AND trashed = 0
          AND mime_type = 'application/vnd.google-apps.folder'
    """
    )
    folder_count = cursor.fetchone()["count"]

    # Regular files (non-folders)
    file_count = active_count - folder_count

    # Shortcuts
    cursor.execute(
        """
        SELECT COUNT(*) as count FROM files
        WHERE removed = 0 AND trashed = 0 AND is_shortcut = 1
    """
    )
    shortcut_count = cursor.fetchone()["count"]

    # Google-native files (Docs, Sheets, Slides, etc.)
    cursor.execute(
        """
        SELECT COUNT(*) as count FROM files
        WHERE removed = 0 AND trashed = 0
          AND mime_type LIKE 'application/vnd.google-apps.%'
          AND mime_type != 'application/vnd.google-apps.folder'
          AND is_shortcut = 0
    """
    )
    google_native_count = cursor.fetchone()["count"]

    # Binary files (non-Google, non-folder)
    cursor.execute(
        """
        SELECT COUNT(*) as count FROM files
        WHERE removed = 0 AND trashed = 0
          AND mime_type NOT LIKE 'application/vnd.google-apps.%'
    """
    )
    binary_count = cursor.fetchone()["count"]

    # Total size of binary files
    cursor.execute(
        """
        SELECT SUM(COALESCE(size, 0)) as total FROM files
        WHERE removed = 0 AND trashed = 0
    """
    )
    total_size = cursor.fetchone()["total"] or 0

    # Files with md5 (can be used for duplicate detection)
    cursor.execute(
        """
        SELECT COUNT(*) as count FROM files
        WHERE removed = 0 AND trashed = 0 AND md5 IS NOT NULL
    """
    )
    with_md5_count = cursor.fetchone()["count"]

    # Files owned by me
    cursor.execute(
        """
        SELECT COUNT(*) as count FROM files
        WHERE removed = 0 AND trashed = 0 AND owned_by_me = 1
    """
    )
    owned_by_me_count = cursor.fetchone()["count"]

    # Parent edge count
    cursor.execute("SELECT COUNT(*) as count FROM parents")
    edge_count = cursor.fetchone()["count"]

    # Removed files (kept for history)
    cursor.execute("SELECT COUNT(*) as count FROM files WHERE removed = 1")
    removed_count = cursor.fetchone()["count"]

    return {
        "total_files": total_files,
        "active_files": active_count,
        "trashed_files": trashed_count,
        "removed_files": removed_count,
        "folders": folder_count,
        "files": file_count,
        "shortcuts": shortcut_count,
        "google_native": google_native_count,
        "binary_files": binary_count,
        "total_size_bytes": total_size,
        "total_size_gb": round(total_size / (1024**3), 2),
        "with_md5": with_md5_count,
        "owned_by_me": owned_by_me_count,
        "parent_edges": edge_count,
    }


def get_mime_type_breakdown(conn) -> List[Dict[str, Any]]:
    """
    Get file counts by MIME type.

    Returns:
        List of {mime_type, count, total_size} sorted by count desc
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT mime_type, COUNT(*) as count, SUM(COALESCE(size, 0)) as total_size
        FROM files
        WHERE removed = 0 AND trashed = 0
        GROUP BY mime_type
        ORDER BY count DESC
    """
    )

    return [dict(row) for row in cursor.fetchall()]


def run_all_health_checks(db_path: Optional[Path] = None) -> HealthCheckResult:
    """
    Run all health checks and return combined result.

    Args:
        db_path: Optional path to database file

    Returns:
        HealthCheckResult with all checks
    """
    result = HealthCheckResult()
    path = db_path or get_db_path()

    try:
        with get_connection(path) as conn:
            # Get stats first
            result.stats = get_stats(conn)

            # Check dangling edges
            edges = check_dangling_edges(conn)
            result.details["dangling_edges"] = edges

            if edges["missing_parent_count"] > 0:
                result.add_warning(
                    f"Found {edges['missing_parent_count']} edges with missing parents"
                )
            if edges["missing_child_count"] > 0:
                result.add_warning(
                    f"Found {edges['missing_child_count']} edges with missing children"
                )

            # Note: Orphans are often normal (root-level items)
            # Only flag if there are a lot compared to expected root items

            # Check shortcuts
            shortcuts = check_unresolved_shortcuts(conn)
            result.details["shortcuts"] = shortcuts

            if shortcuts["unresolved_count"] > 0:
                result.add_warning(
                    f"Found {shortcuts['unresolved_count']} shortcuts with missing targets"
                )

            # Check for cycles
            cycles = check_folder_cycles(conn)
            result.details["cycles"] = cycles

            if cycles["has_cycles"]:
                result.add_error(
                    f"Found {cycles['cycle_count']} cycle(s) in folder structure"
                )

            # Add MIME type breakdown
            result.details["mime_types"] = get_mime_type_breakdown(conn)

            health_logger.info(
                "run_all_health_checks",
                passed=result.passed,
                warnings=len(result.warnings),
                errors=len(result.errors),
                files=result.stats.get("total_files", 0),
            )

    except Exception as e:
        result.add_error(f"Health check failed: {str(e)}")
        health_logger.error("run_all_health_checks", message=str(e))

    return result


def print_health_summary(result: HealthCheckResult) -> str:
    """
    Format health check result as a human-readable summary.

    Args:
        result: HealthCheckResult from run_all_health_checks

    Returns:
        Formatted string summary
    """
    lines = []
    lines.append("=" * 60)
    lines.append("DRIVE INDEX HEALTH CHECK")
    lines.append("=" * 60)

    # Overall status
    if result.passed:
        lines.append("Status: ✓ PASSED")
    else:
        lines.append("Status: ✗ FAILED")

    lines.append("")

    # Stats
    stats = result.stats
    if stats:
        lines.append("Statistics:")
        lines.append(f"  Total files:     {stats.get('total_files', 0):,}")
        lines.append(f"  Active files:    {stats.get('active_files', 0):,}")
        lines.append(f"  Folders:         {stats.get('folders', 0):,}")
        lines.append(f"  Files:           {stats.get('files', 0):,}")
        lines.append(f"  Shortcuts:       {stats.get('shortcuts', 0):,}")
        lines.append(f"  Google native:   {stats.get('google_native', 0):,}")
        lines.append(f"  Binary files:    {stats.get('binary_files', 0):,}")
        lines.append(f"  Total size:      {stats.get('total_size_gb', 0):.2f} GB")
        lines.append(f"  With MD5:        {stats.get('with_md5', 0):,}")
        lines.append(f"  Owned by me:     {stats.get('owned_by_me', 0):,}")
        lines.append(f"  Parent edges:    {stats.get('parent_edges', 0):,}")
        lines.append("")

    # Warnings
    if result.warnings:
        lines.append("Warnings:")
        for warning in result.warnings:
            lines.append(f"  ⚠ {warning}")
        lines.append("")

    # Errors
    if result.errors:
        lines.append("Errors:")
        for error in result.errors:
            lines.append(f"  ✗ {error}")
        lines.append("")

    lines.append("=" * 60)

    return "\n".join(lines)
