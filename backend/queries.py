"""Graph queries and analytics for the Drive index.

This module provides query functions for:
- DAG traversal (path reconstruction, children, ancestors)
- Duplicate detection (group by md5 + size)
- Building children_map for API compatibility
- Folder tree construction
"""

import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from .index_db import (
    get_connection,
    get_db_path,
    get_all_files,
    get_file_by_id,
    get_parents,
    get_children,
)
from .utils.logger import PerformanceLogger

# Performance logger
query_logger = PerformanceLogger("queries")


# =============================================================================
# Path Reconstruction
# =============================================================================


def get_paths(
    conn, file_id: str, max_paths: int = 5, max_depth: int = 50
) -> List[List[str]]:
    """
    Reconstruct all possible folder paths for a file.

    Since files can have multiple parents in Google Drive, a single file
    can appear at multiple paths. This function returns all paths up to
    a limit.

    Args:
        conn: Database connection
        file_id: The file ID to get paths for
        max_paths: Maximum number of paths to return
        max_depth: Maximum folder depth to traverse (prevents infinite loops)

    Returns:
        List of paths, where each path is a list of folder names from root to parent
    """
    paths = []

    def build_paths(current_id: str, current_path: List[str], depth: int):
        if depth > max_depth:
            return
        if len(paths) >= max_paths:
            return

        parent_ids = get_parents(conn, current_id)

        if not parent_ids:
            # Reached a root - this path is complete
            paths.append(list(reversed(current_path)))
            return

        for parent_id in parent_ids:
            if len(paths) >= max_paths:
                break

            parent = get_file_by_id(conn, parent_id)
            if parent:
                parent_name = parent.get("name", parent_id)
                build_paths(parent_id, current_path + [parent_name], depth + 1)
            else:
                # Parent not in DB (orphaned reference)
                paths.append(list(reversed(current_path)))

    build_paths(file_id, [], 0)

    return paths if paths else [[]]  # Return empty path if no paths found


def get_primary_path(conn, file_id: str) -> str:
    """
    Get the primary (shortest) path for a file as a string.

    Args:
        conn: Database connection
        file_id: The file ID

    Returns:
        Path string like "/Folder1/Folder2" or "Root" if no parents
    """
    paths = get_paths(conn, file_id, max_paths=1)

    if not paths or not paths[0]:
        return "Root"

    return "/" + "/".join(paths[0])


def get_full_path_with_name(conn, file_id: str) -> str:
    """
    Get the full path including the file name.

    Args:
        conn: Database connection
        file_id: The file ID

    Returns:
        Full path string like "/Folder1/Folder2/filename.txt"
    """
    file = get_file_by_id(conn, file_id)
    if not file:
        return ""

    parent_path = get_primary_path(conn, file_id)
    name = file.get("name", "")

    if parent_path == "Root":
        return "/" + name

    return parent_path + "/" + name


# =============================================================================
# Duplicate Detection
# =============================================================================


def get_duplicate_groups(
    conn, min_size: int = 0, limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Find groups of duplicate files based on md5 + size.

    Per SPECIFICATION.md, duplicates are defined as:
    - md5 IS NOT NULL
    - size IS NOT NULL
    - trashed = 0
    - NOT a shortcut
    - Group by (md5, size) with count > 1

    Args:
        conn: Database connection
        min_size: Minimum file size to consider (bytes)
        limit: Maximum number of groups to return

    Returns:
        List of duplicate groups, each containing:
        - md5: The MD5 hash
        - size: File size in bytes
        - count: Number of files with this hash/size
        - file_ids: List of file IDs in this group
        - total_wasted: Size that could be saved (size * (count - 1))
    """
    cursor = conn.cursor()

    # Find duplicate groups
    query = """
        SELECT md5, size, COUNT(*) as count, GROUP_CONCAT(id) as file_ids
        FROM files
        WHERE md5 IS NOT NULL
          AND size IS NOT NULL
          AND size >= ?
          AND trashed = 0
          AND removed = 0
          AND is_shortcut = 0
        GROUP BY md5, size
        HAVING COUNT(*) > 1
        ORDER BY size * (COUNT(*) - 1) DESC
    """

    if limit:
        query += f" LIMIT {limit}"

    cursor.execute(query, (min_size,))

    groups = []
    for row in cursor.fetchall():
        file_ids = row["file_ids"].split(",") if row["file_ids"] else []
        groups.append(
            {
                "md5": row["md5"],
                "size": row["size"],
                "count": row["count"],
                "file_ids": file_ids,
                "total_wasted": row["size"] * (row["count"] - 1),
            }
        )

    return groups


def get_duplicate_files_detail(conn, file_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Get detailed info for files in a duplicate group.

    Args:
        conn: Database connection
        file_ids: List of file IDs

    Returns:
        List of file details with paths
    """
    files = []
    for file_id in file_ids:
        file = get_file_by_id(conn, file_id)
        if file:
            files.append(
                {
                    "id": file["id"],
                    "name": file["name"],
                    "size": file["size"],
                    "mime_type": file["mime_type"],
                    "modified_time": file["modified_time"],
                    "created_time": file["created_time"],
                    "web_view_link": file["web_view_link"],
                    "path": get_primary_path(conn, file_id),
                    "owned_by_me": bool(file.get("owned_by_me")),
                }
            )
    return files


def get_total_duplicate_savings(conn) -> Dict[str, Any]:
    """
    Calculate total potential savings from removing duplicates.

    Returns:
        Dict with total_groups, total_files, total_wasted_bytes
    """
    groups = get_duplicate_groups(conn)

    total_wasted = sum(g["total_wasted"] for g in groups)
    total_files = sum(g["count"] - 1 for g in groups)  # Files that could be removed

    return {
        "total_groups": len(groups),
        "total_duplicate_files": total_files,
        "total_wasted_bytes": total_wasted,
    }


# =============================================================================
# Tree and Children Map
# =============================================================================


def build_children_map(conn) -> Dict[str, List[str]]:
    """
    Build a children_map for API compatibility with existing frontend.

    This maps parent_id -> [child_ids] which is the format expected
    by the current ScanResponse model.

    Args:
        conn: Database connection

    Returns:
        Dict mapping parent_id to list of child_ids
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT parent_id, child_id
        FROM parents p
        JOIN files f ON p.child_id = f.id
        WHERE f.removed = 0 AND f.trashed = 0
    """
    )

    children_map = defaultdict(list)
    for row in cursor.fetchall():
        children_map[row["parent_id"]].append(row["child_id"])

    return dict(children_map)


def get_folder_tree(
    conn, root_id: Optional[str] = None, max_depth: int = 10
) -> List[Dict[str, Any]]:
    """
    Build a folder tree structure starting from root.

    Args:
        conn: Database connection
        root_id: Optional folder ID to start from (None = all roots)
        max_depth: Maximum depth to traverse

    Returns:
        List of folder nodes with nested children
    """
    cursor = conn.cursor()

    # Get all folders
    cursor.execute(
        """
        SELECT id, name, mime_type
        FROM files
        WHERE mime_type = 'application/vnd.google-apps.folder'
          AND removed = 0
          AND trashed = 0
    """
    )
    folders = {row["id"]: dict(row) for row in cursor.fetchall()}

    # Build children map
    children_map = build_children_map(conn)

    def build_tree(folder_id: str, depth: int) -> Optional[Dict[str, Any]]:
        if depth > max_depth:
            return None

        folder = folders.get(folder_id)
        if not folder:
            return None

        child_ids = children_map.get(folder_id, [])
        child_folders = []

        for child_id in child_ids:
            if child_id in folders:
                child_tree = build_tree(child_id, depth + 1)
                if child_tree:
                    child_folders.append(child_tree)

        return {
            "id": folder_id,
            "name": folder["name"],
            "children": child_folders,
        }

    if root_id:
        tree = build_tree(root_id, 0)
        return [tree] if tree else []

    # Find root folders (folders with no parents in the folder set)
    root_folders = []
    for folder_id in folders:
        parent_ids = get_parents(conn, folder_id)
        if not parent_ids or not any(p in folders for p in parent_ids):
            tree = build_tree(folder_id, 0)
            if tree:
                root_folders.append(tree)

    return root_folders


# =============================================================================
# File Queries for API Compatibility
# =============================================================================


def get_files_for_api(conn, include_trashed: bool = False) -> List[Dict[str, Any]]:
    """
    Get all files in the format expected by the existing API.

    Converts SQLite rows to the format matching FileItem model:
    - id, name, mimeType, size, calculatedSize, parents, etc.

    Args:
        conn: Database connection
        include_trashed: Whether to include trashed files

    Returns:
        List of file dicts in API format
    """
    cursor = conn.cursor()

    if include_trashed:
        cursor.execute("SELECT * FROM files WHERE removed = 0")
    else:
        cursor.execute("SELECT * FROM files WHERE removed = 0 AND trashed = 0")

    files = []
    for row in cursor.fetchall():
        # Get parents for this file
        parent_ids = get_parents(conn, row["id"])

        # Convert to API format (camelCase as expected by frontend)
        files.append(
            {
                "id": row["id"],
                "name": row["name"],
                "mimeType": row["mime_type"],
                "size": row["size"],
                "calculatedSize": None,  # Will be calculated separately
                "createdTime": row["created_time"],
                "modifiedTime": row["modified_time"],
                "webViewLink": row["web_view_link"],
                "parents": parent_ids,
                # Additional fields from comprehensive fetch
                "trashed": bool(row["trashed"]),
                "starred": (
                    bool(row["starred"]) if row["starred"] is not None else False
                ),
                "ownedByMe": bool(row["owned_by_me"]),
                "md5Checksum": row["md5"],
                "isShortcut": bool(row["is_shortcut"]),
                "shortcutTargetId": row["shortcut_target_id"],
            }
        )

    return files


def calculate_folder_sizes(
    files: List[Dict[str, Any]], children_map: Dict[str, List[str]]
) -> None:
    """
    Calculate folder sizes recursively (mutates files in place).

    This replicates the logic from build_tree_structure for API compatibility.

    Args:
        files: List of file dicts (will be mutated to add calculatedSize)
        children_map: Dict mapping parent_id to child_ids
    """
    file_map = {f["id"]: f for f in files}
    calculated = set()

    def calc_size(file_id: str) -> int:
        if file_id in calculated:
            file = file_map.get(file_id)
            if file:
                return file.get("calculatedSize") or file.get("size") or 0
            return 0

        file = file_map.get(file_id)
        if not file:
            return 0

        # Files have direct size
        if file["mimeType"] != "application/vnd.google-apps.folder":
            calculated.add(file_id)
            return file.get("size") or 0

        # Folders sum their children
        total = 0
        for child_id in children_map.get(file_id, []):
            total += calc_size(child_id)

        file["calculatedSize"] = total
        calculated.add(file_id)
        return total

    # Calculate for all files
    for file in files:
        calc_size(file["id"])


def build_scan_response_data(db_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Build the complete data structure for ScanResponse from SQLite.

    This provides API compatibility with the existing frontend.

    Args:
        db_path: Optional path to database file

    Returns:
        Dict with files, children_map, and stats
    """
    path = db_path or get_db_path()

    with get_connection(path) as conn:
        # Get all files in API format
        files = get_files_for_api(conn)

        # Build children map
        children_map = build_children_map(conn)

        # Calculate folder sizes
        calculate_folder_sizes(files, children_map)

        # Calculate stats
        folders = [
            f for f in files if f["mimeType"] == "application/vnd.google-apps.folder"
        ]
        files_only = [
            f for f in files if f["mimeType"] != "application/vnd.google-apps.folder"
        ]

        total_size = sum(f.get("calculatedSize") or f.get("size") or 0 for f in files)

        stats = {
            "total_files": len(files),
            "total_size": total_size,
            "folder_count": len(folders),
            "file_count": len(files_only),
        }

        return {
            "files": files,
            "children_map": children_map,
            "stats": stats,
        }


# =============================================================================
# Analytics Queries
# =============================================================================


def get_files_by_mime_type(conn) -> Dict[str, List[Dict[str, Any]]]:
    """Group files by MIME type."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT mime_type, COUNT(*) as count, SUM(COALESCE(size, 0)) as total_size
        FROM files
        WHERE removed = 0 AND trashed = 0
        GROUP BY mime_type
        ORDER BY total_size DESC
    """
    )

    result = {}
    for row in cursor.fetchall():
        result[row["mime_type"]] = {
            "count": row["count"],
            "total_size": row["total_size"] or 0,
        }

    return result


def get_large_files(conn, limit: int = 100, min_size: int = 0) -> List[Dict[str, Any]]:
    """Get largest files."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, name, mime_type, size, modified_time, web_view_link
        FROM files
        WHERE removed = 0 AND trashed = 0 AND size IS NOT NULL AND size >= ?
        ORDER BY size DESC
        LIMIT ?
    """,
        (min_size, limit),
    )

    files = []
    for row in cursor.fetchall():
        file_dict = dict(row)
        file_dict["path"] = get_primary_path(conn, row["id"])
        files.append(file_dict)

    return files


def get_shortcuts(conn) -> List[Dict[str, Any]]:
    """Get all shortcuts with their targets."""
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT s.id, s.name, s.shortcut_target_id, s.shortcut_target_mime,
               t.name as target_name, t.id as target_exists
        FROM files s
        LEFT JOIN files t ON s.shortcut_target_id = t.id AND t.removed = 0
        WHERE s.is_shortcut = 1 AND s.removed = 0 AND s.trashed = 0
    """
    )

    shortcuts = []
    for row in cursor.fetchall():
        shortcuts.append(
            {
                "id": row["id"],
                "name": row["name"],
                "target_id": row["shortcut_target_id"],
                "target_mime": row["shortcut_target_mime"],
                "target_name": row["target_name"],
                "target_exists": row["target_exists"] is not None,
                "path": get_primary_path(conn, row["id"]),
            }
        )

    return shortcuts
