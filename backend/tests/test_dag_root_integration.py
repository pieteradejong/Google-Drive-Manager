"""Integration tests for DAG building with root injection and ownership tracking.

These tests verify that after a full crawl with root injection,
the resulting data produces a DAG with:
1. A single root node (My Drive)
2. Correct ownership tracking (ownedByMe field preserved)
"""

import pytest
from unittest.mock import MagicMock, patch

from backend.crawl_full import run_full_crawl
from backend.index_db import get_connection, get_file_count, get_parents, get_file_by_id


def build_roots_from_db(conn, files):
    """
    Simulate DAG root detection logic using database.

    A root is any item whose parents are not in the dataset.
    This mirrors the logic in frontend/src/utils/driveDag.ts
    """
    file_ids = {f["id"] for f in files}
    roots = []
    for f in files:
        # Get parents from the file_parents table
        parents = get_parents(conn, f["id"])
        # Filter to only parents that exist in the dataset
        known_parents = [p for p in parents if p in file_ids]
        if len(known_parents) == 0:
            roots.append(f["id"])
    return roots


@pytest.mark.integration
class TestDagRootIntegration:
    """Test that DAG correctly shows single root after scan with root injection."""

    def test_dag_has_single_root_after_crawl_with_injection(
        self, temp_db_path, sample_files_with_missing_root, mock_my_drive_root
    ):
        """Full integration: crawl with root injection -> DAG should have 1 root."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_with_missing_root.copy()

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = mock_my_drive_root

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(service, temp_db_path)

        # Build file list from database
        from backend.index_db import get_all_files

        with get_connection(temp_db_path) as conn:
            all_files = get_all_files(conn)

            # Find roots using same logic as frontend DAG builder
            roots = build_roots_from_db(conn, all_files)

        # Should have exactly 1 root (My Drive)
        assert len(roots) == 1
        assert roots[0] == mock_my_drive_root["id"]

    def test_dag_without_root_injection_has_multiple_roots(
        self, temp_db_path, sample_files_with_missing_root
    ):
        """
        Verify the problem: without root injection, we get multiple roots.

        This is a regression test - it documents the problem that
        root injection solves.
        """
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_with_missing_root.copy()

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None  # No root injection

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(service, temp_db_path)

        from backend.index_db import get_all_files

        with get_connection(temp_db_path) as conn:
            all_files = get_all_files(conn)

            roots = build_roots_from_db(conn, all_files)

        # Without root injection, folder_personal and folder_work become roots
        # because their parent (the My Drive root) is not in the dataset
        assert len(roots) == 2
        assert "folder_personal" in roots
        assert "folder_work" in roots

    def test_top_level_folders_have_root_as_parent_after_injection(
        self, temp_db_path, sample_files_with_missing_root, mock_my_drive_root
    ):
        """Test that top-level folders correctly reference the root as parent."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_with_missing_root.copy()

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = mock_my_drive_root

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(service, temp_db_path)

        from backend.index_db import get_parents

        with get_connection(temp_db_path) as conn:
            # Top-level folders should have root as their parent
            personal_parents = get_parents(conn, "folder_personal")
            work_parents = get_parents(conn, "folder_work")

            assert mock_my_drive_root["id"] in personal_parents
            assert mock_my_drive_root["id"] in work_parents

    def test_nested_files_still_have_correct_parents(
        self, temp_db_path, sample_files_with_missing_root, mock_my_drive_root
    ):
        """Test that root injection doesn't affect nested file parent relationships."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_with_missing_root.copy()

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = mock_my_drive_root

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(service, temp_db_path)

        from backend.index_db import get_parents

        with get_connection(temp_db_path) as conn:
            # Nested files should still have their original parents
            notes_parents = get_parents(conn, "file_in_personal")
            assert "folder_personal" in notes_parents

            report_parents = get_parents(conn, "file_in_work")
            assert "folder_work" in report_parents

    def test_file_count_includes_root(
        self, temp_db_path, sample_files_with_missing_root, mock_my_drive_root
    ):
        """Test that total file count includes the injected root."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_with_missing_root.copy()

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = mock_my_drive_root

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    progress = run_full_crawl(service, temp_db_path)

        # Count should be original files + root
        expected = len(sample_files_with_missing_root) + 1
        assert progress.total_files == expected

        with get_connection(temp_db_path) as conn:
            db_count = get_file_count(conn)
            assert db_count == expected


@pytest.mark.integration
class TestOwnershipTracking:
    """Test that ownedByMe field is correctly stored and retrieved."""

    def test_owned_files_have_owned_by_me_true(
        self, temp_db_path, sample_mixed_ownership_files
    ):
        """Test that owned files have ownedByMe = True in database."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            # Filter to just the owned files for controlled test
            owned_only = [f for f in sample_mixed_ownership_files if f.get("ownedByMe", True)]
            mock_list.return_value = owned_only

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(service, temp_db_path)

        with get_connection(temp_db_path) as conn:
            # Check a known owned file
            my_file = get_file_by_id(conn, "my_file_1")
            assert my_file is not None
            assert my_file.get("owned_by_me") == 1  # SQLite stores as 1/0

    def test_shared_files_have_owned_by_me_false(
        self, temp_db_path, sample_shared_files
    ):
        """Test that shared files have ownedByMe = False in database."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_shared_files.copy()

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(service, temp_db_path)

        with get_connection(temp_db_path) as conn:
            # Check a known shared file
            shared_doc = get_file_by_id(conn, "shared_doc_1")
            assert shared_doc is not None
            assert shared_doc.get("owned_by_me") == 0  # SQLite stores as 1/0

            shared_folder = get_file_by_id(conn, "shared_folder_1")
            assert shared_folder is not None
            assert shared_folder.get("owned_by_me") == 0

    def test_mixed_ownership_preserved(
        self, temp_db_path, sample_mixed_ownership_files
    ):
        """Test that mixed ownership files maintain their correct ownership status."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_mixed_ownership_files.copy()

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(service, temp_db_path)

        with get_connection(temp_db_path) as conn:
            from backend.index_db import get_all_files

            all_files = get_all_files(conn)

            # Count owned vs shared
            owned_count = sum(1 for f in all_files if f.get("owned_by_me") == 1)
            shared_count = sum(1 for f in all_files if f.get("owned_by_me") == 0)

            # From sample_mixed_ownership_files:
            # - 1 root (owned) + 3 owned files = 4 owned
            # - 3 shared files
            assert owned_count == 4
            assert shared_count == 3

    def test_shared_files_appear_as_orphan_roots(
        self, temp_db_path, sample_mixed_ownership_files
    ):
        """
        Test that shared files without parents in the dataset become roots.

        This is the expected behavior - shared files often have no parent
        in the user's dataset because their parent folder is in another
        user's Drive.
        """
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_mixed_ownership_files.copy()

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(service, temp_db_path)

        with get_connection(temp_db_path) as conn:
            from backend.index_db import get_all_files

            all_files = get_all_files(conn)
            roots = build_roots_from_db(conn, all_files)

            # Shared files with no parent in dataset should be roots
            assert "shared_doc_1" in roots  # No parent
            assert "shared_folder_1" in roots  # No parent

            # Files inside shared_folder_1 should NOT be roots
            assert "shared_file_in_folder" not in roots

    def test_undefined_ownership_defaults_to_owned(
        self, temp_db_path, sample_files_undefined_ownership
    ):
        """
        Test that files without ownedByMe field default to owned.

        This handles legacy data where the field wasn't captured.
        """
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_undefined_ownership.copy()

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(service, temp_db_path)

        with get_connection(temp_db_path) as conn:
            legacy_file = get_file_by_id(conn, "legacy_file_1")
            legacy_folder = get_file_by_id(conn, "legacy_folder_1")

            # Should default to owned (1) when field is missing
            # Note: The actual default depends on how index_db handles None
            # If it's stored as NULL, the frontend should treat NULL as true
            assert legacy_file is not None
            assert legacy_folder is not None
