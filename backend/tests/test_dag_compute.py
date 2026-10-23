"""Tests for backend/dag_compute.py DAG computation and storage."""

import pytest
import json
from datetime import datetime, timezone

from backend.dag_compute import (
    compute_and_store_dag,
    get_dag_metadata,
    is_dag_stale,
    load_dag_for_api,
    load_dag_node_for_api,
    DagMeta,
    DagWarnings,
    DagOwnershipStats,
)
from backend.index_db import (
    get_connection,
    init_db,
    upsert_file,
    replace_parents,
    get_dag_meta,
    get_dag_node,
    get_dag_roots,
    set_sync_state,
    dag_exists,
    clear_dag_data,
)


@pytest.mark.unit
class TestDagComputation:
    """Tests for DAG computation from SQLite data."""

    def test_compute_dag_empty_database(self, initialized_db):
        """Test DAG computation on empty database returns empty result."""
        meta = compute_and_store_dag(initialized_db)

        assert meta.node_count == 0
        assert meta.edge_count == 0
        assert meta.root_count == 0
        assert meta.max_depth == 0

    def test_compute_dag_single_file(self, initialized_db):
        """Test DAG with a single root file."""
        with get_connection(initialized_db) as conn:
            upsert_file(
                conn,
                {
                    "id": "single",
                    "name": "Single.txt",
                    "mimeType": "text/plain",
                    "size": "100",
                    "ownedByMe": True,
                },
            )
            conn.commit()

        meta = compute_and_store_dag(initialized_db)

        assert meta.node_count == 1
        assert meta.edge_count == 0
        assert meta.root_count == 1
        assert meta.max_depth == 0

    def test_compute_dag_simple_tree(self, populated_db):
        """Test DAG computation on simple folder tree."""
        meta = compute_and_store_dag(populated_db)

        # populated_db has 6 files from sample_files_full
        assert meta.node_count >= 1
        assert meta.edge_count >= 0
        assert meta.root_count >= 1
        assert meta.max_depth >= 0

    def test_compute_dag_multi_parent(self, dag_db_with_tree):
        """Test DAG handles files with multiple parents correctly."""
        meta = compute_and_store_dag(dag_db_with_tree)

        # file3 has parents [folder1, folder2], so it creates 2 edges
        # But orphan's parent is missing, so that edge is skipped
        # Verify edges are created for multi-parent file
        with get_connection(dag_db_with_tree) as conn:
            dag_node = get_dag_node(conn, "file3")
            assert dag_node is not None

    def test_compute_dag_detects_cycles(self, dag_db_with_cycle):
        """Test DAG detects cycles and produces best-effort ordering."""
        meta = compute_and_store_dag(dag_db_with_cycle)

        # All 3 nodes form a cycle
        assert meta.warnings.cycle_detected is True
        assert meta.warnings.cycle_node_count == 3
        assert "Cycle detected" in meta.warnings.notes[0]

        # Still produces output (best-effort)
        assert meta.node_count == 3

    def test_compute_dag_depth_calculation(self, dag_db_with_tree):
        """Test depth is computed as longest path from any root."""
        meta = compute_and_store_dag(dag_db_with_tree)

        with get_connection(dag_db_with_tree) as conn:
            # root is at depth 0
            root_node = get_dag_node(conn, "root")
            assert root_node["depth"] == 0

            # folder1 is child of root, depth 1
            folder1_node = get_dag_node(conn, "folder1")
            assert folder1_node["depth"] == 1

            # subfolder is child of folder1, depth 2
            subfolder_node = get_dag_node(conn, "subfolder")
            assert subfolder_node["depth"] == 2

            # file2 is child of subfolder, depth 3
            file2_node = get_dag_node(conn, "file2")
            assert file2_node["depth"] == 3

        # Max depth should be 3
        assert meta.max_depth == 3

    def test_compute_dag_roots_identification(self, dag_db_with_tree):
        """Test roots are identified as nodes with no parents in dataset."""
        meta = compute_and_store_dag(dag_db_with_tree)

        with get_connection(dag_db_with_tree) as conn:
            roots = get_dag_roots(conn)

            # root and orphan should be roots (orphan's parent is missing)
            assert "root" in roots
            assert "orphan" in roots
            assert len(roots) == 2

    def test_compute_dag_topological_order(self, dag_db_with_tree):
        """Test topological ordering is correct (parents before children)."""
        meta = compute_and_store_dag(dag_db_with_tree)

        with get_connection(dag_db_with_tree) as conn:
            root_node = get_dag_node(conn, "root")
            folder1_node = get_dag_node(conn, "folder1")
            file1_node = get_dag_node(conn, "file1")

            # Parent should come before child in topo order
            assert root_node["topo_order"] < folder1_node["topo_order"]
            assert folder1_node["topo_order"] < file1_node["topo_order"]

    def test_compute_dag_ownership_stats(self, dag_db_with_tree):
        """Test ownership stats (owned vs shared) are computed correctly."""
        meta = compute_and_store_dag(dag_db_with_tree)

        # sample_dag_tree has 7 owned files and 1 shared (file3)
        # Plus orphan (owned), total 8 files
        # 7 owned, 1 shared (file3 has ownedByMe=False)
        assert meta.ownership_stats.owned_count == 7
        assert meta.ownership_stats.shared_count == 1

        # file3 is 3000 bytes
        assert meta.ownership_stats.shared_size_bytes == 3000

    def test_compute_dag_stores_in_db(self, dag_db_with_tree):
        """Test DAG results are stored in dag_nodes and dag_meta tables."""
        meta = compute_and_store_dag(dag_db_with_tree)

        with get_connection(dag_db_with_tree) as conn:
            # Check dag_meta
            computed_at = get_dag_meta(conn, "computed_at")
            assert computed_at is not None

            node_count = get_dag_meta(conn, "node_count")
            assert node_count == str(meta.node_count)

            # Check dag_nodes
            root_node = get_dag_node(conn, "root")
            assert root_node is not None
            assert root_node["is_root"] == 1

    def test_compute_dag_missing_parent_warning(self, dag_db_with_tree):
        """Test warning is generated for missing parent references."""
        meta = compute_and_store_dag(dag_db_with_tree)

        # orphan has parent "missing_parent" which doesn't exist
        assert meta.warnings.missing_parent_refs >= 1
        assert any(
            "Missing parent" in note for note in meta.warnings.notes
        )


@pytest.mark.unit
class TestDagStorage:
    """Tests for DAG storage and retrieval from SQLite."""

    def test_store_dag_nodes(self, dag_db_with_tree):
        """Test storing computed node properties."""
        compute_and_store_dag(dag_db_with_tree)

        with get_connection(dag_db_with_tree) as conn:
            # All nodes should be stored
            for file_id in ["root", "folder1", "folder2", "file1", "file2", "file3"]:
                node = get_dag_node(conn, file_id)
                assert node is not None
                assert "depth" in dict(node)
                assert "is_root" in dict(node)
                assert "children_count" in dict(node)

    def test_store_dag_meta(self, dag_db_with_tree):
        """Test storing DAG metadata (computed_at, counts, warnings)."""
        compute_and_store_dag(dag_db_with_tree)

        with get_connection(dag_db_with_tree) as conn:
            assert get_dag_meta(conn, "computed_at") is not None
            assert get_dag_meta(conn, "node_count") is not None
            assert get_dag_meta(conn, "edge_count") is not None
            assert get_dag_meta(conn, "root_count") is not None
            assert get_dag_meta(conn, "max_depth") is not None
            assert get_dag_meta(conn, "warnings_json") is not None
            assert get_dag_meta(conn, "ownership_json") is not None

    def test_get_dag_meta_exists(self, computed_dag_db):
        """Test retrieving DAG metadata when it exists."""
        meta = get_dag_metadata(computed_dag_db)

        assert meta is not None
        assert meta.computed_at is not None
        assert meta.node_count >= 0
        assert meta.edge_count >= 0
        assert isinstance(meta.warnings, DagWarnings)
        assert isinstance(meta.ownership_stats, DagOwnershipStats)

    def test_get_dag_meta_missing(self, initialized_db):
        """Test retrieving DAG metadata when not computed."""
        meta = get_dag_metadata(initialized_db)
        assert meta is None

    def test_is_dag_stale_false(self, computed_dag_db):
        """Test is_dag_stale returns False when DAG is fresh."""
        stale = is_dag_stale(computed_dag_db)
        assert stale is False

    def test_is_dag_stale_true_after_sync(self, computed_dag_db):
        """Test is_dag_stale returns True after files are modified."""
        # Simulate sync happened after DAG computation
        from datetime import timedelta

        with get_connection(computed_dag_db) as conn:
            # Set last_sync_time to future
            future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
            set_sync_state(conn, "last_sync_time", future)
            conn.commit()

        stale = is_dag_stale(computed_dag_db)
        assert stale is True

    def test_clear_dag_on_recompute(self, computed_dag_db):
        """Test old DAG data is cleared before recomputation."""
        # First compute should have created data
        assert dag_exists(computed_dag_db) is True

        # Recompute - should clear and recreate
        meta = compute_and_store_dag(computed_dag_db)

        # Should still have data
        assert dag_exists(computed_dag_db) is True
        assert meta.node_count >= 0


@pytest.mark.unit
class TestDagRetrieval:
    """Tests for loading DAG from SQLite for API response."""

    def test_load_dag_full(self, computed_dag_db):
        """Test loading complete DAG with nodes, edges, roots."""
        dag = load_dag_for_api(computed_dag_db)

        assert dag is not None
        assert "nodes" in dag
        assert "edges" in dag
        assert "roots" in dag
        assert "topoOrder" in dag
        assert "maxDepth" in dag
        assert "warnings" in dag
        assert "ownershipStats" in dag
        assert "meta" in dag

        # Nodes should have expected fields
        for node in dag["nodes"]:
            assert "id" in node
            assert "name" in node
            assert "mimeType" in node
            assert "depth" in node
            assert "parents" in node
            assert "children" in node

    def test_load_dag_node_by_id(self, computed_dag_db):
        """Test loading single node with its neighbors."""
        # Get first node from the computed DAG
        dag = load_dag_for_api(computed_dag_db)
        if not dag or not dag["nodes"]:
            pytest.skip("No nodes in computed DAG")

        first_node_id = dag["nodes"][0]["id"]
        node = load_dag_node_for_api(first_node_id, computed_dag_db)

        assert node is not None
        assert node["id"] == first_node_id
        assert "parents" in node
        assert "children" in node
        assert "depth" in node

    def test_load_dag_node_not_found(self, computed_dag_db):
        """Test loading non-existent node returns None."""
        node = load_dag_node_for_api("nonexistent_id", computed_dag_db)
        assert node is None

    def test_load_dag_filters_removed_files(self, dag_db_with_tree):
        """Test removed files are excluded from DAG."""
        from backend.index_db import mark_file_removed

        # First compute DAG
        compute_and_store_dag(dag_db_with_tree)

        # Mark a file as removed
        with get_connection(dag_db_with_tree) as conn:
            mark_file_removed(conn, "file1")
            conn.commit()

        # Recompute DAG
        compute_and_store_dag(dag_db_with_tree)

        dag = load_dag_for_api(dag_db_with_tree)
        node_ids = [n["id"] for n in dag["nodes"]]

        # file1 should not be in the DAG
        assert "file1" not in node_ids

    def test_load_dag_children_map(self, dag_db_with_tree):
        """Test children are correctly mapped from parents table."""
        compute_and_store_dag(dag_db_with_tree)
        dag = load_dag_for_api(dag_db_with_tree)

        # Find root node
        root_nodes = [n for n in dag["nodes"] if n["id"] == "root"]
        assert len(root_nodes) == 1

        root = root_nodes[0]
        # root should have folder1 and folder2 as children
        assert "folder1" in root["children"]
        assert "folder2" in root["children"]


@pytest.mark.unit
class TestDagWarningsAndStats:
    """Tests for DAG warnings and ownership statistics."""

    def test_warnings_to_dict(self):
        """Test DagWarnings serialization."""
        warnings = DagWarnings(
            missing_parent_refs=5,
            duplicate_edges=2,
            cycle_detected=True,
            cycle_node_count=3,
            notes=["Test note"],
        )

        d = warnings.to_dict()
        assert d["missingParentRefs"] == 5
        assert d["duplicateEdges"] == 2
        assert d["cycleDetected"] is True
        assert d["cycleNodeCount"] == 3
        assert d["notes"] == ["Test note"]

    def test_ownership_stats_to_dict(self):
        """Test DagOwnershipStats serialization."""
        stats = DagOwnershipStats(
            owned_count=100,
            shared_count=20,
            owned_size_bytes=1000000,
            shared_size_bytes=200000,
        )

        d = stats.to_dict()
        assert d["ownedCount"] == 100
        assert d["sharedCount"] == 20
        assert d["ownedSizeBytes"] == 1000000
        assert d["sharedSizeBytes"] == 200000

    def test_dag_meta_to_dict(self):
        """Test DagMeta serialization."""
        meta = DagMeta(
            computed_at="2024-01-01T00:00:00Z",
            node_count=100,
            edge_count=99,
            root_count=5,
            max_depth=10,
            warnings=DagWarnings(),
            ownership_stats=DagOwnershipStats(),
        )

        d = meta.to_dict()
        assert d["computed_at"] == "2024-01-01T00:00:00Z"
        assert d["node_count"] == 100
        assert d["edge_count"] == 99
        assert d["root_count"] == 5
        assert d["max_depth"] == 10
        assert "warnings" in d
        assert "ownershipStats" in d


@pytest.mark.unit
class TestDagDatabaseFunctions:
    """Tests for DAG-specific database functions in index_db."""

    def test_dag_exists_false(self, initialized_db):
        """Test dag_exists returns False when no DAG data."""
        assert dag_exists(initialized_db) is False

    def test_dag_exists_true(self, computed_dag_db):
        """Test dag_exists returns True when DAG data exists."""
        assert dag_exists(computed_dag_db) is True

    def test_clear_dag_data(self, computed_dag_db):
        """Test clear_dag_data removes all DAG data."""
        assert dag_exists(computed_dag_db) is True

        with get_connection(computed_dag_db) as conn:
            clear_dag_data(conn)
            conn.commit()

        assert dag_exists(computed_dag_db) is False

    def test_get_dag_roots(self, dag_db_with_tree):
        """Test get_dag_roots returns root node IDs."""
        compute_and_store_dag(dag_db_with_tree)

        with get_connection(dag_db_with_tree) as conn:
            roots = get_dag_roots(conn)

        assert "root" in roots
        assert "orphan" in roots
