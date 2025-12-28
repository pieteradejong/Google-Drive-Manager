"""Tests for backend/crawl_full.py full crawl algorithm."""

import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, call

from backend.crawl_full import (
    run_full_crawl,
    needs_full_crawl,
    get_last_crawl_info,
    CrawlProgress,
)
from backend.index_db import (
    get_connection,
    get_sync_state,
    get_file_count,
    init_db,
    set_sync_state,
)


@pytest.mark.unit
class TestCrawlProgress:
    """Tests for CrawlProgress class."""

    def test_crawl_progress_initial_state(self):
        """Test initial progress state."""
        progress = CrawlProgress()

        assert progress.stage == "initializing"
        assert progress.files_fetched == 0
        assert progress.files_processed == 0
        assert progress.total_files == 0
        assert progress.errors == 0

    def test_crawl_progress_to_dict(self):
        """Test progress serialization."""
        progress = CrawlProgress()
        progress.stage = "fetching"
        progress.files_fetched = 100
        progress.started_at = datetime.now(timezone.utc)

        result = progress.to_dict()

        assert result["stage"] == "fetching"
        assert result["files_fetched"] == 100
        assert result["started_at"] is not None
        assert "progress_pct" in result

    def test_crawl_progress_percentage_initializing(self):
        """Test progress percentage in initializing stage."""
        progress = CrawlProgress()
        progress.stage = "initializing"

        assert progress._progress_pct() == 0.0

    def test_crawl_progress_percentage_fetching(self):
        """Test progress percentage in fetching stage."""
        progress = CrawlProgress()
        progress.stage = "fetching"
        progress.files_fetched = 2500

        pct = progress._progress_pct()
        # Estimate based on 5000 files typical
        assert 0 < pct <= 40

    def test_crawl_progress_percentage_processing(self):
        """Test progress percentage in processing stage."""
        progress = CrawlProgress()
        progress.stage = "processing"
        progress.total_files = 100
        progress.files_processed = 50

        pct = progress._progress_pct()
        # Should be between 40% and 90%
        assert 40 <= pct <= 90

    def test_crawl_progress_percentage_complete(self):
        """Test progress percentage when complete."""
        progress = CrawlProgress()
        progress.stage = "complete"

        assert progress._progress_pct() == 100.0


@pytest.mark.unit
class TestRunFullCrawl:
    """Tests for run_full_crawl function."""

    def test_run_full_crawl_success(self, temp_db_path, sample_files_full):
        """Test successful full crawl."""
        service = MagicMock()

        # Mock list_all_files_full
        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_full

            # Mock get_my_drive_root (returns None = no root injection)
            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None

                # Mock get_start_page_token
                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "test_start_token"

                    progress = run_full_crawl(service, temp_db_path)

        assert progress.stage == "complete"
        assert progress.total_files == len(sample_files_full)
        assert progress.files_processed == len(sample_files_full)
        assert progress.completed_at is not None

        # Verify database was populated
        with get_connection(temp_db_path) as conn:
            count = get_file_count(conn)
            assert count == len(sample_files_full)

            # Verify sync state was saved
            token = get_sync_state(conn, "start_page_token")
            assert token == "test_start_token"

    def test_run_full_crawl_with_progress_callback(
        self, temp_db_path, sample_files_full
    ):
        """Test progress callback is invoked."""
        service = MagicMock()
        progress_updates = []

        def progress_callback(progress):
            progress_updates.append(
                {
                    "stage": progress.stage,
                    "files_fetched": progress.files_fetched,
                    "files_processed": progress.files_processed,
                }
            )

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_full

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(
                        service, temp_db_path, progress_callback=progress_callback
                    )

        # Should have multiple progress updates
        assert (
            len(progress_updates) >= 3
        )  # initializing, fetching, processing, finalizing, complete

        # Check stages were reported
        stages = [u["stage"] for u in progress_updates]
        assert "initializing" in stages
        assert "complete" in stages

    def test_run_full_crawl_handles_file_errors(self, temp_db_path):
        """Test that individual file errors don't stop the crawl."""
        service = MagicMock()

        # Create files where one will cause an error (missing id)
        files = [
            {"id": "file1", "name": "Good.txt", "mimeType": "text/plain"},
            {
                "name": "NoId.txt",
                "mimeType": "text/plain",
            },  # Missing id - will be skipped
            {"id": "file3", "name": "AlsoGood.txt", "mimeType": "text/plain"},
        ]

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = files

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    progress = run_full_crawl(service, temp_db_path)

        assert progress.stage == "complete"
        # File with no id is skipped, so 2 files should be processed
        with get_connection(temp_db_path) as conn:
            count = get_file_count(conn)
            assert count == 2

    def test_run_full_crawl_stores_parent_edges(self, temp_db_path, sample_files_full):
        """Test that parent-child relationships are stored."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_full

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(service, temp_db_path)

        from backend.index_db import get_children

        with get_connection(temp_db_path) as conn:
            # Check that folder1 has children
            children = get_children(conn, "folder1")
            assert "file2" in children
            assert "folder2" in children

    def test_run_full_crawl_stores_crawl_time(self, temp_db_path, sample_files_full):
        """Test that crawl time is stored."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_full

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(service, temp_db_path)

        with get_connection(temp_db_path) as conn:
            crawl_time = get_sync_state(conn, "last_full_crawl_time")
            assert crawl_time is not None

            sync_time = get_sync_state(conn, "last_sync_time")
            assert sync_time is not None

    def test_run_full_crawl_api_error(self, temp_db_path):
        """Test that API errors are propagated."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.side_effect = Exception("API Error")

            with pytest.raises(Exception, match="API Error"):
                run_full_crawl(service, temp_db_path)

    def test_run_full_crawl_empty_drive(self, temp_db_path):
        """Test crawl with empty drive."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = []

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    progress = run_full_crawl(service, temp_db_path)

        assert progress.stage == "complete"
        assert progress.total_files == 0


@pytest.mark.unit
class TestNeedsFullCrawl:
    """Tests for needs_full_crawl function."""

    def test_needs_full_crawl_no_database(self, tmp_path):
        """Test returns True when database doesn't exist."""
        result = needs_full_crawl(tmp_path / "nonexistent.db")
        assert result is True

    def test_needs_full_crawl_no_token(self, temp_db_path):
        """Test returns True when no start_page_token exists."""
        init_db(temp_db_path)

        result = needs_full_crawl(temp_db_path)
        assert result is True

    def test_needs_full_crawl_has_token(self, temp_db_path):
        """Test returns False when start_page_token exists."""
        init_db(temp_db_path)

        with get_connection(temp_db_path) as conn:
            set_sync_state(conn, "start_page_token", "test_token")
            conn.commit()

        result = needs_full_crawl(temp_db_path)
        assert result is False


@pytest.mark.unit
class TestGetLastCrawlInfo:
    """Tests for get_last_crawl_info function."""

    def test_get_last_crawl_info_no_database(self, tmp_path):
        """Test returns None when database doesn't exist."""
        result = get_last_crawl_info(tmp_path / "nonexistent.db")
        assert result is None

    def test_get_last_crawl_info_no_crawl(self, temp_db_path):
        """Test returns None when no crawl has been done."""
        init_db(temp_db_path)

        result = get_last_crawl_info(temp_db_path)
        assert result is None

    def test_get_last_crawl_info_has_crawl(self, populated_db):
        """Test returns info after crawl."""
        result = get_last_crawl_info(populated_db)

        assert result is not None
        assert "last_full_crawl_time" in result
        assert "last_sync_time" in result
        assert "file_count" in result
        assert result["file_count"] > 0


@pytest.mark.unit
class TestRootFolderInjection:
    """Tests for My Drive root folder injection in crawl."""

    def test_run_full_crawl_injects_root(
        self, temp_db_path, sample_files_with_missing_root, mock_my_drive_root
    ):
        """Test that My Drive root is injected into crawl results."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_with_missing_root.copy()

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = mock_my_drive_root

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    progress = run_full_crawl(service, temp_db_path)

        assert progress.stage == "complete"
        # Total should be original files + injected root
        expected_count = len(sample_files_with_missing_root) + 1
        assert progress.total_files == expected_count

        # Verify root is in database
        with get_connection(temp_db_path) as conn:
            from backend.index_db import get_file_by_id

            root = get_file_by_id(conn, mock_my_drive_root["id"])
            assert root is not None
            assert root["name"] == "My Drive"

    def test_run_full_crawl_root_is_first_in_list(
        self, temp_db_path, sample_files_with_missing_root, mock_my_drive_root
    ):
        """Test that root is inserted at the beginning of the file list."""
        service = MagicMock()
        captured_files = []

        def capture_upsert(conn, file_dict):
            captured_files.append(file_dict.get("id"))
            # Call real upsert
            from backend.index_db import upsert_file as real_upsert

            return real_upsert(conn, file_dict)

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_with_missing_root.copy()

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = mock_my_drive_root

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    with patch(
                        "backend.crawl_full.upsert_file", side_effect=capture_upsert
                    ):
                        run_full_crawl(service, temp_db_path)

        # Root should be first
        assert captured_files[0] == mock_my_drive_root["id"]

    def test_run_full_crawl_continues_if_root_fetch_fails(
        self, temp_db_path, sample_files_full
    ):
        """Test graceful degradation when root fetch fails."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_full

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = None  # Simulates API failure

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    progress = run_full_crawl(service, temp_db_path)

        # Should still complete successfully
        assert progress.stage == "complete"
        # File count should NOT include root (since injection failed)
        assert progress.total_files == len(sample_files_full)

    def test_run_full_crawl_root_has_correct_parent_edges(
        self, temp_db_path, sample_files_with_missing_root, mock_my_drive_root
    ):
        """Test that parent edges are correctly set for root (none) and children."""
        service = MagicMock()

        with patch("backend.crawl_full.list_all_files_full") as mock_list:
            mock_list.return_value = sample_files_with_missing_root.copy()

            with patch("backend.crawl_full.get_my_drive_root") as mock_root:
                mock_root.return_value = mock_my_drive_root

                with patch("backend.crawl_full.get_start_page_token") as mock_token:
                    mock_token.return_value = "token"

                    run_full_crawl(service, temp_db_path)

        from backend.index_db import get_parents, get_children

        with get_connection(temp_db_path) as conn:
            # Root should have no parents
            root_parents = get_parents(conn, mock_my_drive_root["id"])
            assert root_parents == []

            # Root should have children (the top-level folders)
            root_children = get_children(conn, mock_my_drive_root["id"])
            assert "folder_personal" in root_children
            assert "folder_work" in root_children
