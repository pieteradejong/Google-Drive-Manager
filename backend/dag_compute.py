"""DAG computation module for Google Drive file structure.

This module computes and stores the DAG (Directed Acyclic Graph) representation
of the Drive file structure. The DAG captures:
- Parent-child relationships (edges)
- Topological ordering (for traversal)
- Depth computation (longest path from root)
- Root identification (nodes with no parents in dataset)
- Ownership statistics

The computed DAG is stored in SQLite for fast retrieval by the frontend.
"""

import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from .index_db import (
    clear_dag_data,
    get_all_edges,
    get_all_files,
    get_children,
    get_connection,
    get_dag_meta,
    get_dag_node,
    get_dag_roots,
    get_file_by_id,
    get_parents,
    set_dag_meta,
    upsert_dag_node,
)
from .utils.logger import PerformanceLogger

# Performance logger
dag_logger = PerformanceLogger("dag_compute")

# Folder MIME type constant
FOLDER_MIME = "application/vnd.google-apps.folder"


@dataclass
class DagWarnings:
    """Warnings generated during DAG computation."""

    missing_parent_refs: int = 0
    duplicate_edges: int = 0
    cycle_detected: bool = False
    cycle_node_count: int = 0
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "missingParentRefs": self.missing_parent_refs,
            "duplicateEdges": self.duplicate_edges,
            "cycleDetected": self.cycle_detected,
            "cycleNodeCount": self.cycle_node_count,
            "notes": self.notes,
        }


@dataclass
class DagOwnershipStats:
    """Ownership statistics for the DAG."""

    owned_count: int = 0
    shared_count: int = 0
    owned_size_bytes: int = 0
    shared_size_bytes: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ownedCount": self.owned_count,
            "sharedCount": self.shared_count,
            "ownedSizeBytes": self.owned_size_bytes,
            "sharedSizeBytes": self.shared_size_bytes,
        }


@dataclass
class DagMeta:
    """Metadata about the computed DAG."""

    computed_at: str
    node_count: int
    edge_count: int
    root_count: int
    max_depth: int
    warnings: DagWarnings
    ownership_stats: DagOwnershipStats

    def to_dict(self) -> Dict[str, Any]:
        return {
            "computed_at": self.computed_at,
            "node_count": self.node_count,
            "edge_count": self.edge_count,
            "root_count": self.root_count,
            "max_depth": self.max_depth,
            "warnings": self.warnings.to_dict(),
            "ownershipStats": self.ownership_stats.to_dict(),
        }


@dataclass
class DagNodeInfo:
    """Information about a single DAG node."""

    id: str
    name: str
    mime_type: str
    is_folder: bool
    owned_by_me: bool
    depth: int
    parents: List[str]
    children: List[str]
    size: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "mimeType": self.mime_type,
            "isFolder": self.is_folder,
            "ownedByMe": self.owned_by_me,
            "depth": self.depth,
            "parents": self.parents,
            "children": self.children,
            "size": self.size,
        }


def compute_and_store_dag(db_path: Optional[Path] = None) -> DagMeta:
    """
    Compute the DAG from files and parents tables, store in dag_nodes and dag_meta.

    This is the main entry point for DAG computation. It:
    1. Loads all files and parent edges from SQLite
    2. Computes roots, topological order, and depths
    3. Stores the results in dag_nodes and dag_meta tables
    4. Returns metadata about the computed DAG

    Args:
        db_path: Optional path to database file

    Returns:
        DagMeta object with computation results
    """
    with get_connection(db_path) as conn:
        # Clear existing DAG data
        clear_dag_data(conn)
        conn.commit()

        # Load all files (not trashed, not removed)
        files = get_all_files(conn, include_trashed=False, include_removed=False)
        file_ids = {f["id"] for f in files}
        file_by_id = {f["id"]: f for f in files}

        dag_logger.info(
            "compute_dag_start",
            message=f"Starting DAG computation for {len(files)} files",
        )

        # Build parent and children maps
        children_by_id: Dict[str, Set[str]] = defaultdict(set)
        parents_by_id: Dict[str, List[str]] = defaultdict(list)
        edges: List[Tuple[str, str]] = []
        edge_set: Set[str] = set()

        warnings = DagWarnings()

        # Load edges from parents table
        all_edges = get_all_edges(conn)

        for parent_id, child_id in all_edges:
            # Skip edges where either node doesn't exist in our file set
            if child_id not in file_ids:
                continue

            if parent_id not in file_ids:
                warnings.missing_parent_refs += 1
                continue

            edge_key = f"{parent_id}->{child_id}"
            if edge_key in edge_set:
                warnings.duplicate_edges += 1
                continue

            edge_set.add(edge_key)
            edges.append((parent_id, child_id))
            children_by_id[parent_id].add(child_id)
            parents_by_id[child_id].append(parent_id)

        # Identify roots: nodes with no known parents in dataset
        roots: List[str] = []
        for file_id in file_ids:
            if len(parents_by_id.get(file_id, [])) == 0:
                roots.append(file_id)

        # Compute indegree for Kahn's algorithm
        indegree: Dict[str, int] = {fid: 0 for fid in file_ids}
        for parent_id, child_id in edges:
            indegree[child_id] = indegree.get(child_id, 0) + 1

        # Kahn's algorithm for topological sort
        queue: List[str] = [fid for fid, deg in indegree.items() if deg == 0]
        topo_order: List[str] = []
        local_indegree = dict(indegree)

        while queue:
            node = queue.pop(0)
            topo_order.append(node)

            for child in children_by_id.get(node, set()):
                local_indegree[child] = local_indegree.get(child, 0) - 1
                if local_indegree[child] == 0:
                    queue.append(child)

        # Check for cycles
        if len(topo_order) != len(file_ids):
            warnings.cycle_detected = True
            cycle_nodes = [fid for fid, deg in local_indegree.items() if deg > 0]
            warnings.cycle_node_count = len(cycle_nodes)
            warnings.notes.append(
                f"Cycle detected: {len(cycle_nodes)} nodes involved (best-effort ordering used)"
            )
            # Append remaining nodes for stable best-effort order
            topo_order.extend(cycle_nodes)

        # Compute depths (longest path from any root)
        depth_by_id: Dict[str, int] = {fid: 0 for fid in file_ids}

        for node_id in topo_order:
            node_depth = depth_by_id.get(node_id, 0)
            for child in children_by_id.get(node_id, set()):
                new_depth = node_depth + 1
                if new_depth > depth_by_id.get(child, 0):
                    depth_by_id[child] = new_depth

        max_depth = max(depth_by_id.values()) if depth_by_id else 0

        # Add warning notes
        if warnings.missing_parent_refs > 0:
            warnings.notes.append(
                f"Missing parent references: {warnings.missing_parent_refs:,}"
            )
        if warnings.duplicate_edges > 0:
            warnings.notes.append(
                f"Duplicate edges ignored: {warnings.duplicate_edges:,}"
            )

        # Compute ownership stats
        ownership = DagOwnershipStats()
        for f in files:
            size = f.get("size") or 0
            owned = f.get("owned_by_me")
            # Handle None and integer values from SQLite
            if owned is None or owned == 1 or owned is True:
                ownership.owned_count += 1
                ownership.owned_size_bytes += size
            else:
                ownership.shared_count += 1
                ownership.shared_size_bytes += size

        # Store DAG nodes
        root_set = set(roots)
        for i, node_id in enumerate(topo_order):
            depth = depth_by_id.get(node_id, 0)
            is_root = node_id in root_set
            children_count = len(children_by_id.get(node_id, set()))
            upsert_dag_node(conn, node_id, depth, is_root, children_count, i)

        # Store DAG metadata
        computed_at = datetime.now(timezone.utc).isoformat()
        set_dag_meta(conn, "computed_at", computed_at)
        set_dag_meta(conn, "node_count", str(len(file_ids)))
        set_dag_meta(conn, "edge_count", str(len(edges)))
        set_dag_meta(conn, "root_count", str(len(roots)))
        set_dag_meta(conn, "max_depth", str(max_depth))
        set_dag_meta(conn, "warnings_json", json.dumps(warnings.to_dict()))
        set_dag_meta(conn, "ownership_json", json.dumps(ownership.to_dict()))

        conn.commit()

        meta = DagMeta(
            computed_at=computed_at,
            node_count=len(file_ids),
            edge_count=len(edges),
            root_count=len(roots),
            max_depth=max_depth,
            warnings=warnings,
            ownership_stats=ownership,
        )

        dag_logger.info(
            "compute_dag_complete",
            message=f"DAG computed: {meta.node_count} nodes, {meta.edge_count} edges, "
            f"{meta.root_count} roots, max_depth={meta.max_depth}",
        )

        return meta


def get_dag_metadata(db_path: Optional[Path] = None) -> Optional[DagMeta]:
    """
    Get DAG metadata from the database.

    Returns None if DAG has not been computed.
    """
    try:
        with get_connection(db_path) as conn:
            computed_at = get_dag_meta(conn, "computed_at")
            if not computed_at:
                return None

            node_count = int(get_dag_meta(conn, "node_count") or "0")
            edge_count = int(get_dag_meta(conn, "edge_count") or "0")
            root_count = int(get_dag_meta(conn, "root_count") or "0")
            max_depth = int(get_dag_meta(conn, "max_depth") or "0")

            warnings_json = get_dag_meta(conn, "warnings_json")
            if warnings_json:
                w = json.loads(warnings_json)
                warnings = DagWarnings(
                    missing_parent_refs=w.get("missingParentRefs", 0),
                    duplicate_edges=w.get("duplicateEdges", 0),
                    cycle_detected=w.get("cycleDetected", False),
                    cycle_node_count=w.get("cycleNodeCount", 0),
                    notes=w.get("notes", []),
                )
            else:
                warnings = DagWarnings()

            ownership_json = get_dag_meta(conn, "ownership_json")
            if ownership_json:
                o = json.loads(ownership_json)
                ownership = DagOwnershipStats(
                    owned_count=o.get("ownedCount", 0),
                    shared_count=o.get("sharedCount", 0),
                    owned_size_bytes=o.get("ownedSizeBytes", 0),
                    shared_size_bytes=o.get("sharedSizeBytes", 0),
                )
            else:
                ownership = DagOwnershipStats()

            return DagMeta(
                computed_at=computed_at,
                node_count=node_count,
                edge_count=edge_count,
                root_count=root_count,
                max_depth=max_depth,
                warnings=warnings,
                ownership_stats=ownership,
            )
    except Exception:
        return None


def is_dag_stale(db_path: Optional[Path] = None) -> bool:
    """
    Check if the DAG needs recomputation.

    The DAG is considered stale if:
    - It doesn't exist
    - The last_sync_time or last_full_crawl_time is newer than computed_at
    """
    try:
        with get_connection(db_path) as conn:
            computed_at = get_dag_meta(conn, "computed_at")
            if not computed_at:
                return True

            from .index_db import get_sync_state

            last_sync = get_sync_state(conn, "last_sync_time")
            last_crawl = get_sync_state(conn, "last_full_crawl_time")

            # Compare timestamps
            dag_time = datetime.fromisoformat(computed_at.replace("Z", "+00:00"))

            if last_sync:
                sync_time = datetime.fromisoformat(last_sync.replace("Z", "+00:00"))
                if sync_time > dag_time:
                    return True

            if last_crawl:
                crawl_time = datetime.fromisoformat(last_crawl.replace("Z", "+00:00"))
                if crawl_time > dag_time:
                    return True

            return False
    except Exception:
        return True


def load_dag_for_api(db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    """
    Load the full DAG for API response.

    Returns a dictionary matching the frontend DriveDag interface structure.
    """
    meta = get_dag_metadata(db_path)
    if not meta:
        return None

    with get_connection(db_path) as conn:
        # Load all files
        files = get_all_files(conn, include_trashed=False, include_removed=False)
        file_by_id = {f["id"]: f for f in files}

        # Load all edges
        edges_raw = get_all_edges(conn)
        file_ids = set(file_by_id.keys())

        # Filter edges to only include those with both nodes present
        edges = [
            {"from": p, "to": c}
            for p, c in edges_raw
            if p in file_ids and c in file_ids
        ]

        # Build children and parents maps
        children_by_id: Dict[str, List[str]] = defaultdict(list)
        parents_by_id: Dict[str, List[str]] = defaultdict(list)

        for p, c in edges_raw:
            if p in file_ids and c in file_ids:
                children_by_id[p].append(c)
                parents_by_id[c].append(p)

        # Get roots
        roots = get_dag_roots(conn)

        # Build nodes list
        nodes = []
        topo_order = []

        # Get DAG node info for each file
        for f in files:
            dag_node = get_dag_node(conn, f["id"])
            if not dag_node:
                continue

            node_info = {
                "id": f["id"],
                "name": f.get("name", ""),
                "mimeType": f.get("mime_type", ""),
                "isFolder": f.get("mime_type") == FOLDER_MIME,
                "ownedByMe": bool(f.get("owned_by_me", True)),
                "depth": dag_node["depth"],
                "parents": parents_by_id.get(f["id"], []),
                "children": children_by_id.get(f["id"], []),
                "size": f.get("size"),
            }
            nodes.append(node_info)

            # Track topo order
            if dag_node["topo_order"] is not None:
                topo_order.append((dag_node["topo_order"], f["id"]))

        # Sort by topo order
        topo_order.sort(key=lambda x: x[0])
        topo_order_ids = [x[1] for x in topo_order]

        return {
            "nodes": nodes,
            "edges": edges,
            "roots": roots,
            "topoOrder": topo_order_ids,
            "maxDepth": meta.max_depth,
            "warnings": meta.warnings.to_dict(),
            "ownershipStats": meta.ownership_stats.to_dict(),
            "meta": {
                "computed_at": meta.computed_at,
                "node_count": meta.node_count,
                "edge_count": meta.edge_count,
                "root_count": meta.root_count,
            },
        }


def load_dag_node_for_api(
    node_id: str, db_path: Optional[Path] = None
) -> Optional[Dict[str, Any]]:
    """
    Load a single DAG node with its neighbors for API response.
    """
    with get_connection(db_path) as conn:
        # Get file info
        file_info = get_file_by_id(conn, node_id)
        if not file_info:
            return None

        # Get DAG node info
        dag_node = get_dag_node(conn, node_id)
        if not dag_node:
            return None

        # Get parents and children
        parents = get_parents(conn, node_id)
        children = get_children(conn, node_id)

        return {
            "id": file_info["id"],
            "name": file_info.get("name", ""),
            "mimeType": file_info.get("mime_type", ""),
            "isFolder": file_info.get("mime_type") == FOLDER_MIME,
            "ownedByMe": bool(file_info.get("owned_by_me", True)),
            "depth": dag_node["depth"],
            "parents": parents,
            "children": children,
            "size": file_info.get("size"),
            "isRoot": bool(dag_node["is_root"]),
            "childrenCount": dag_node["children_count"],
            "topoOrder": dag_node["topo_order"],
        }
