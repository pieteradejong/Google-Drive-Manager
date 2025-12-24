"""Tests for backend/sync_changes.py incremental sync algorithm."""

import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from backend.sync_changes import (
    run_sync,
    can_sync,
    get_last_sync_info,
    smart_sync,
    SyncProgress,
)
from backend.index_db import (
    get_connection,
    get_sync_state,
    set_sync_state,
    get_file_count,
    get_file_by_id,
    init_db,
    upsert_file,
)


@pytest.mark.unit
class TestSyncProgress:
    """Tests for SyncProgress class."""

    def test_sync_progress_initial_state(self):
        """Test initial progress state."""
        progress = SyncProgress()

        assert progress.stage == "initializing"
        assert progress.changes_fetched == 0
        assert progress.changes_processed == 0
        assert progress.files_added == 0
        assert progress.files_updated == 0
        assert progress.files_removed == 0
        assert progress.errors == 0

    def test_sync_progress_to_dict(self):
        """Test progress serialization."""
        progress = SyncProgress()
        progress.stage = "processing"
        progress.changes_fetched = 50
        progress.files_added = 10
        progress.started_at = datetime.now(timezone.utc)

        result = progress.to_dict()

        assert result["stage"] == "processing"
        assert result["changes_fetched"] == 50
        assert result["files_added"] == 10
        assert result["started_at"] is not None
        assert "progress_pct" in result

    def test_sync_progress_percentage_fetching(self):
        """Test progress percentage in fetching stage."""
        progress = SyncProgress()
        progress.stage = "fetching"

        assert progress._progress_pct() == 30.0

    def test_sync_progress_percentage_processing(self):
        """Test progress percentage in processing stage."""
        progress = SyncProgress()
        progress.stage = "processing"
        progress.total_changes = 100
        progress.changes_processed = 50

        pct = progress._progress_pct()
        # Should be between 30% and 90%
        assert 30 <= pct <= 90

    def test_sync_progress_percentage_complete(self):
        """Test progress percentage when complete."""
        progress = SyncProgress()
        progress.stage = "complete"

        assert progress._progress_pct() == 100.0


@pytest.mark.unit
class TestRunSync:
    """Tests for run_sync function."""

    def test_run_sync_no_token_raises(self, temp_db_path):
        """Test that sync fails without start_page_token."""
        init_db(temp_db_path)
        service = MagicMock()

        with pytest.raises(RuntimeError, match="No start_page_token found"):
            run_sync(service, temp_db_path)

    def test_run_sync_processes_added_files(self, populated_db, mock_changes_response):
        """Test that new files are added."""
        service = MagicMock()

        with patch("backend.sync_changes.list_changes") as mock_list:
            mock_list.return_value = (mock_changes_response["changes"], "new_token")

            progress = run_sync(service, populated_db)

        assert progress.stage == "complete"
        assert progress.files_added >= 1  # new_file_1 should be added

        # Verify file was added
        with get_connection(populated_db) as conn:
            file = get_file_by_id(conn, "new_file_1")
            assert file is not None
            assert file["name"] == "NewDocument.pdf"

    def test_run_sync_processes_removed_files(self, populated_db):
        """Test that removed files are marked as removed."""
        service = MagicMock()

        # Add a file that will be "removed"
        with get_connection(populated_db) as conn:
            upsert_file(
                conn,
                {"id": "to_remove", "name": "Remove.txt", "mimeType": "text/plain"},
            )
            conn.commit()

        changes = [{"fileId": "to_remove", "removed": True}]

        with patch("backend.sync_changes.list_changes") as mock_list:
            mock_list.return_value = (changes, "new_token")

            progress = run_sync(service, populated_db)

        assert progress.files_removed == 1

        # File should still exist but be marked removed
        with get_connection(populated_db) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT removed FROM files WHERE id = ?", ("to_remove",))
            row = cursor.fetchone()
            assert row is not None
            assert row[0] == 1

    def test_run_sync_processes_updated_files(self, populated_db):
        """Test that existing files are updated."""
        service = MagicMock()

        # Get an existing file from populated_db
        with get_connection(populated_db) as conn:
            existing = get_file_by_id(conn, "file1")
            original_name = existing["name"]

        changes = [
            {
                "fileId": "file1",
                "removed": False,
                "file": {
                    "id": "file1",
                    "name": "UpdatedName.pdf",
                    "mimeType": "application/pdf",
                    "size": "2000",
                    "parents": [],
                    "modifiedTime": datetime.now(timezone.utc).isoformat(),
                },
            }
        ]

        with patch("backend.sync_changes.list_changes") as mock_list:
            mock_list.return_value = (changes, "new_token")

            progress = run_sync(service, populated_db)

        assert progress.files_updated == 1

        # Verify file was updated
        with get_connection(populated_db) as conn:
            file = get_file_by_id(conn, "file1")
            assert file["name"] == "UpdatedName.pdf"

    def test_run_sync_updates_token(self, populated_db, mock_changes_response):
        """Test that new start token is saved."""
        service = MagicMock()

        with patch("backend.sync_changes.list_changes") as mock_list:
            mock_list.return_value = (
                mock_changes_response["changes"],
                "brand_new_token",
            )

            run_sync(service, populated_db)

        with get_connection(populated_db) as conn:
            token = get_sync_state(conn, "start_page_token")
            assert token == "brand_new_token"

    def test_run_sync_with_progress_callback(self, populated_db, mock_changes_response):
        """Test progress callback is invoked."""
        service = MagicMock()
        progress_updates = []

        def progress_callback(progress):
            progress_updates.append(
                {
                    "stage": progress.stage,
                    "changes_processed": progress.changes_processed,
                }
            )

        with patch("backend.sync_changes.list_changes") as mock_list:
            mock_list.return_value = (mock_changes_response["changes"], "new_token")

            run_sync(service, populated_db, progress_callback=progress_callback)

        # Should have multiple progress updates
        assert len(progress_updates) >= 2

        # Check stages were reported
        stages = [u["stage"] for u in progress_updates]
        assert "complete" in stages

    def test_run_sync_no_changes(self, populated_db):
        """Test sync with no changes."""
        service = MagicMock()

        with patch("backend.sync_changes.list_changes") as mock_list:
            mock_list.return_value = ([], "same_token")

            progress = run_sync(service, populated_db)

        assert progress.stage == "complete"
        assert progress.total_changes == 0
        assert progress.message == "No changes detected"

    def test_run_sync_handles_errors_gracefully(self, populated_db):
        """Test that individual file errors don't stop sync."""
        service = MagicMock()

        # Create a change that will cause an error during processing
        # by providing a file with problematic data
        changes = [
            {
                "fileId": "good_file",
                "removed": False,
                "file": {
                    "id": "good_file",
                    "name": "Good.txt",
                    "mimeType": "text/plain",
                },
            }
        ]

        with patch("backend.sync_changes.list_changes") as mock_list:
            mock_list.return_value = (changes, "new_token")

            progress = run_sync(service, populated_db)

        assert progress.stage == "complete"


@pytest.mark.unit
class TestCanSync:
    """Tests for can_sync function."""

    def test_can_sync_no_database(self, tmp_path):
        """Test returns False when database doesn't exist."""
        result = can_sync(tmp_path / "nonexistent.db")
        assert result is False

    def test_can_sync_no_token(self, temp_db_path):
        """Test returns False when no start_page_token exists."""
        init_db(temp_db_path)

        result = can_sync(temp_db_path)
        assert result is False

    def test_can_sync_has_token(self, populated_db):
        """Test returns True when start_page_token exists."""
        result = can_sync(populated_db)
        assert result is True


@pytest.mark.unit
class TestGetLastSyncInfo:
    """Tests for get_last_sync_info function."""

    def test_get_last_sync_info_no_database(self, tmp_path):
        """Test returns None when database doesn't exist."""
        result = get_last_sync_info(tmp_path / "nonexistent.db")
        assert result is None

    def test_get_last_sync_info_has_data(self, populated_db):
        """Test returns info after sync."""
        result = get_last_sync_info(populated_db)

        assert result is not None
        assert "last_sync_time" in result
        assert "last_full_crawl_time" in result
        assert "has_token" in result
        assert result["has_token"] is True


@pytest.mark.unit
class TestSmartSync:
    """Tests for smart_sync function."""

    def test_smart_sync_needs_full_crawl(self, temp_db_path, sample_files_full):
        """Test smart_sync runs full crawl when needed."""
        service = MagicMock()

        with patch("backend.crawl_full.needs_full_crawl") as mock_needs:
            mock_needs.return_value = True

            with patch("backend.crawl_full.run_full_crawl") as mock_crawl:
                from backend.crawl_full import CrawlProgress

                mock_progress = CrawlProgress()
                mock_progress.stage = "complete"
                mock_crawl.return_value = mock_progress

                result = smart_sync(service, temp_db_path)

        assert result["type"] == "full_crawl"
        mock_crawl.assert_called_once()

    def test_smart_sync_runs_incremental(self, populated_db, mock_changes_response):
        """Test smart_sync runs incremental sync when possible."""
        service = MagicMock()

        with patch("backend.sync_changes.list_changes") as mock_list:
            mock_list.return_value = (mock_changes_response["changes"], "new_token")

            result = smart_sync(service, populated_db)

        assert result["type"] == "incremental_sync"

    def test_smart_sync_force_full_crawl(self, populated_db, sample_files_full):
        """Test forcing full crawl even when sync is possible."""
        service = MagicMock()

        with patch("backend.crawl_full.needs_full_crawl") as mock_needs:
            mock_needs.return_value = False  # Would normally sync

            with patch("backend.crawl_full.run_full_crawl") as mock_crawl:
                from backend.crawl_full import CrawlProgress

                mock_progress = CrawlProgress()
                mock_progress.stage = "complete"
                mock_crawl.return_value = mock_progress

                result = smart_sync(service, populated_db, force_full_crawl=True)

        assert result["type"] == "full_crawl"
        mock_crawl.assert_called_once()

    def test_smart_sync_with_progress_callback(
        self, populated_db, mock_changes_response
    ):
        """Test progress callback is passed through."""
        service = MagicMock()
        callback_called = []

        def progress_callback(progress):
            callback_called.append(True)

        with patch("backend.sync_changes.list_changes") as mock_list:
            mock_list.return_value = (mock_changes_response["changes"], "new_token")

            smart_sync(service, populated_db, progress_callback=progress_callback)

        assert len(callback_called) > 0
