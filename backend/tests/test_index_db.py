"""Tests for backend/index_db.py SQLite database layer."""

import pytest
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

from backend.index_db import (
    get_db_path,
    get_connection,
    init_db,
    upsert_file,
    replace_parents,
    mark_file_removed,
    get_sync_state,
    set_sync_state,
    log_file_error,
    get_file_by_id,
    get_all_files,
    get_parents,
    get_children,
    get_file_count,
    clear_database,
    database_exists,
    SCHEMA_VERSION,
)


@pytest.mark.unit
class TestDatabasePath:
    """Tests for database path functions."""

    def test_get_db_path_returns_path(self):
        """Test that get_db_path returns a Path object."""
        path = get_db_path()
        assert isinstance(path, Path)
        assert path.name == "drive_index.db"

    def test_get_db_path_creates_parent_directory(self, tmp_path, monkeypatch):
        """Test that parent directory is created."""
        # This test verifies the function doesn't fail if parent doesn't exist
        # In production, the actual path is used
        path = get_db_path()
        assert path.parent.exists()


@pytest.mark.unit
class TestDatabaseConnection:
    """Tests for database connection management."""

    def test_get_connection_context_manager(self, temp_db_path):
        """Test connection context manager works correctly."""
        init_db(temp_db_path)

        with get_connection(temp_db_path) as conn:
            assert conn is not None
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            assert result[0] == 1

    def test_get_connection_uses_wal_mode(self, temp_db_path):
        """Test that WAL journal mode is enabled."""
        init_db(temp_db_path)

        with get_connection(temp_db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA journal_mode")
            result = cursor.fetchone()
            assert result[0].lower() == "wal"

    def test_get_connection_row_factory(self, temp_db_path):
        """Test that row factory is set for dict-like access."""
        init_db(temp_db_path)

        with get_connection(temp_db_path) as conn:
            assert conn.row_factory == sqlite3.Row


@pytest.mark.unit
class TestInitDatabase:
    """Tests for database initialization."""

    def test_init_db_creates_tables(self, temp_db_path):
        """Test that all tables are created."""
        init_db(temp_db_path)

        with get_connection(temp_db_path) as conn:
            cursor = conn.cursor()

            # Check files table exists
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='files'"
            )
            assert cursor.fetchone() is not None

            # Check parents table exists
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='parents'"
            )
            assert cursor.fetchone() is not None

            # Check sync_state table exists
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='sync_state'"
            )
            assert cursor.fetchone() is not None

            # Check file_errors table exists
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='file_errors'"
            )
            assert cursor.fetchone() is not None

    def test_init_db_creates_indexes(self, temp_db_path):
        """Test that indexes are created."""
        init_db(temp_db_path)

        with get_connection(temp_db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
            indexes = [row[0] for row in cursor.fetchall()]

            assert "idx_files_md5_size" in indexes
            assert "idx_files_mime" in indexes
            assert "idx_files_modified" in indexes
            assert "idx_parents_parent" in indexes
            assert "idx_parents_child" in indexes

    def test_init_db_sets_schema_version(self, temp_db_path):
        """Test that schema version is stored."""
        init_db(temp_db_path)

        with get_connection(temp_db_path) as conn:
            version = get_sync_state(conn, "schema_version")
            assert version == str(SCHEMA_VERSION)

    def test_init_db_is_idempotent(self, temp_db_path):
        """Test that init_db can be called multiple times safely."""
        init_db(temp_db_path)
        init_db(temp_db_path)  # Should not raise

        with get_connection(temp_db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
            count = cursor.fetchone()[0]
            assert count >= 4


@pytest.mark.unit
class TestUpsertFile:
    """Tests for file upsert operations."""

    def test_upsert_file_insert(self, initialized_db, sample_files_full):
        """Test inserting a new file."""
        file_dict = sample_files_full[0]

        with get_connection(initialized_db) as conn:
            upsert_file(conn, file_dict)
            conn.commit()

            result = get_file_by_id(conn, file_dict["id"])

            assert result is not None
            assert result["name"] == file_dict["name"]
            assert result["mime_type"] == file_dict["mimeType"]

    def test_upsert_file_update(self, initialized_db):
        """Test updating an existing file."""
        file_dict = {
            "id": "update_test",
            "name": "Original.txt",
            "mimeType": "text/plain",
            "size": "100",
        }

        with get_connection(initialized_db) as conn:
            # Insert
            upsert_file(conn, file_dict)
            conn.commit()

            # Update
            file_dict["name"] = "Updated.txt"
            file_dict["size"] = "200"
            upsert_file(conn, file_dict)
            conn.commit()

            result = get_file_by_id(conn, "update_test")
            assert result["name"] == "Updated.txt"
            assert result["size"] == 200

    def test_upsert_file_with_shortcut(self, initialized_db):
        """Test inserting a shortcut file."""
        shortcut = {
            "id": "shortcut_test",
            "name": "My Shortcut",
            "mimeType": "application/vnd.google-apps.shortcut",
            "shortcutDetails": {
                "targetId": "target_file_id",
                "targetMimeType": "application/pdf",
            },
        }

        with get_connection(initialized_db) as conn:
            upsert_file(conn, shortcut)
            conn.commit()

            result = get_file_by_id(conn, "shortcut_test")
            assert result["is_shortcut"] == 1
            assert result["shortcut_target_id"] == "target_file_id"
            assert result["shortcut_target_mime"] == "application/pdf"

    def test_upsert_file_with_owners_and_capabilities(self, initialized_db):
        """Test that owners and capabilities are stored as JSON."""
        file_dict = {
            "id": "full_metadata_test",
            "name": "Full.txt",
            "mimeType": "text/plain",
            "owners": [{"displayName": "Test", "emailAddress": "test@example.com"}],
            "capabilities": {"canTrash": True, "canDelete": False},
        }

        with get_connection(initialized_db) as conn:
            upsert_file(conn, file_dict)
            conn.commit()

            result = get_file_by_id(conn, "full_metadata_test")
            assert result["owners_json"] is not None
            assert result["capabilities_json"] is not None
            assert "Test" in result["owners_json"]

    def test_upsert_file_stores_raw_json(self, initialized_db, sample_files_full):
        """Test that raw JSON is stored."""
        file_dict = sample_files_full[0]

        with get_connection(initialized_db) as conn:
            upsert_file(conn, file_dict)
            conn.commit()

            result = get_file_by_id(conn, file_dict["id"])
            assert result["raw_json"] is not None
            assert file_dict["name"] in result["raw_json"]

    def test_upsert_file_clears_removed_flag(self, initialized_db):
        """Test that upserting clears the removed flag."""
        file_dict = {"id": "remove_test", "name": "Test.txt", "mimeType": "text/plain"}

        with get_connection(initialized_db) as conn:
            upsert_file(conn, file_dict)
            conn.commit()

            # Mark as removed
            mark_file_removed(conn, "remove_test")
            conn.commit()

            # Upsert again should clear removed flag
            upsert_file(conn, file_dict)
            conn.commit()

            cursor = conn.cursor()
            cursor.execute("SELECT removed FROM files WHERE id = ?", ("remove_test",))
            assert cursor.fetchone()[0] == 0

    def test_upsert_file_skips_empty_id(self, initialized_db):
        """Test that files without ID are skipped."""
        file_dict = {"name": "NoId.txt", "mimeType": "text/plain"}

        with get_connection(initialized_db) as conn:
            upsert_file(conn, file_dict)  # Should not raise
            conn.commit()

            count = get_file_count(conn)
            assert count == 0


@pytest.mark.unit
class TestParentEdges:
    """Tests for parent-child relationship management."""

    def test_replace_parents_insert(self, initialized_db):
        """Test inserting parent edges."""
        with get_connection(initialized_db) as conn:
            # Create file first
            upsert_file(
                conn, {"id": "child1", "name": "Child", "mimeType": "text/plain"}
            )

            replace_parents(conn, "child1", ["parent1", "parent2"])
            conn.commit()

            parents = get_parents(conn, "child1")
            assert len(parents) == 2
            assert "parent1" in parents
            assert "parent2" in parents

    def test_replace_parents_replaces_existing(self, initialized_db):
        """Test that existing parents are replaced."""
        with get_connection(initialized_db) as conn:
            upsert_file(
                conn, {"id": "child2", "name": "Child", "mimeType": "text/plain"}
            )

            # Initial parents
            replace_parents(conn, "child2", ["old_parent"])
            conn.commit()

            # New parents
            replace_parents(conn, "child2", ["new_parent1", "new_parent2"])
            conn.commit()

            parents = get_parents(conn, "child2")
            assert len(parents) == 2
            assert "old_parent" not in parents
            assert "new_parent1" in parents
            assert "new_parent2" in parents

    def test_get_children(self, populated_db):
        """Test getting children of a folder."""
        with get_connection(populated_db) as conn:
            children = get_children(conn, "folder1")

            # folder1 should have file2 and folder2 as children
            assert "file2" in children
            assert "folder2" in children


@pytest.mark.unit
class TestMarkFileRemoved:
    """Tests for file removal marking."""

    def test_mark_file_removed_sets_flag(self, initialized_db):
        """Test that removed flag is set."""
        with get_connection(initialized_db) as conn:
            upsert_file(
                conn, {"id": "remove1", "name": "ToRemove", "mimeType": "text/plain"}
            )
            conn.commit()

            mark_file_removed(conn, "remove1")
            conn.commit()

            cursor = conn.cursor()
            cursor.execute("SELECT removed FROM files WHERE id = ?", ("remove1",))
            assert cursor.fetchone()[0] == 1

    def test_mark_file_removed_deletes_parent_edges(self, initialized_db):
        """Test that parent edges are deleted."""
        with get_connection(initialized_db) as conn:
            upsert_file(
                conn, {"id": "remove2", "name": "ToRemove", "mimeType": "text/plain"}
            )
            replace_parents(conn, "remove2", ["parent1", "parent2"])
            conn.commit()

            mark_file_removed(conn, "remove2")
            conn.commit()

            parents = get_parents(conn, "remove2")
            assert len(parents) == 0

    def test_removed_files_excluded_from_queries(self, initialized_db):
        """Test that removed files are excluded from get_all_files."""
        with get_connection(initialized_db) as conn:
            upsert_file(
                conn, {"id": "visible", "name": "Visible", "mimeType": "text/plain"}
            )
            upsert_file(
                conn, {"id": "removed", "name": "Removed", "mimeType": "text/plain"}
            )
            mark_file_removed(conn, "removed")
            conn.commit()

            files = get_all_files(conn)
            ids = [f["id"] for f in files]

            assert "visible" in ids
            assert "removed" not in ids


@pytest.mark.unit
class TestSyncState:
    """Tests for sync state management."""

    def test_set_and_get_sync_state(self, initialized_db):
        """Test storing and retrieving sync state."""
        with get_connection(initialized_db) as conn:
            set_sync_state(conn, "test_key", "test_value")
            conn.commit()

            result = get_sync_state(conn, "test_key")
            assert result == "test_value"

    def test_get_sync_state_missing_key(self, initialized_db):
        """Test getting non-existent key returns None."""
        with get_connection(initialized_db) as conn:
            result = get_sync_state(conn, "nonexistent")
            assert result is None

    def test_set_sync_state_overwrites(self, initialized_db):
        """Test that set_sync_state overwrites existing value."""
        with get_connection(initialized_db) as conn:
            set_sync_state(conn, "overwrite_key", "old_value")
            conn.commit()

            set_sync_state(conn, "overwrite_key", "new_value")
            conn.commit()

            result = get_sync_state(conn, "overwrite_key")
            assert result == "new_value"


@pytest.mark.unit
class TestFileErrors:
    """Tests for error logging."""

    def test_log_file_error(self, initialized_db):
        """Test logging file processing errors."""
        with get_connection(initialized_db) as conn:
            log_file_error(conn, "file123", "crawl", "Test error message")
            conn.commit()

            cursor = conn.cursor()
            cursor.execute("SELECT * FROM file_errors WHERE file_id = ?", ("file123",))
            row = cursor.fetchone()

            assert row is not None
            assert row["stage"] == "crawl"
            assert row["error"] == "Test error message"
            assert row["created_time"] is not None


@pytest.mark.unit
class TestGetAllFiles:
    """Tests for get_all_files function."""

    def test_get_all_files_basic(self, populated_db):
        """Test getting all files."""
        with get_connection(populated_db) as conn:
            files = get_all_files(conn)

            assert len(files) >= 1
            assert all("id" in f for f in files)

    def test_get_all_files_excludes_trashed_by_default(self, initialized_db):
        """Test that trashed files are excluded by default."""
        with get_connection(initialized_db) as conn:
            upsert_file(
                conn,
                {
                    "id": "normal",
                    "name": "Normal",
                    "mimeType": "text/plain",
                    "trashed": False,
                },
            )
            upsert_file(
                conn,
                {
                    "id": "trashed",
                    "name": "Trashed",
                    "mimeType": "text/plain",
                    "trashed": True,
                },
            )
            conn.commit()

            files = get_all_files(conn, include_trashed=False)
            ids = [f["id"] for f in files]

            assert "normal" in ids
            assert "trashed" not in ids

    def test_get_all_files_include_trashed(self, initialized_db):
        """Test including trashed files."""
        with get_connection(initialized_db) as conn:
            upsert_file(
                conn,
                {
                    "id": "normal",
                    "name": "Normal",
                    "mimeType": "text/plain",
                    "trashed": False,
                },
            )
            upsert_file(
                conn,
                {
                    "id": "trashed",
                    "name": "Trashed",
                    "mimeType": "text/plain",
                    "trashed": True,
                },
            )
            conn.commit()

            files = get_all_files(conn, include_trashed=True)
            ids = [f["id"] for f in files]

            assert "normal" in ids
            assert "trashed" in ids


@pytest.mark.unit
class TestFileCount:
    """Tests for get_file_count function."""

    def test_get_file_count(self, populated_db):
        """Test file count."""
        with get_connection(populated_db) as conn:
            count = get_file_count(conn)
            assert count > 0

    def test_get_file_count_empty(self, initialized_db):
        """Test file count on empty database."""
        with get_connection(initialized_db) as conn:
            count = get_file_count(conn)
            assert count == 0


@pytest.mark.unit
class TestClearDatabase:
    """Tests for clear_database function."""

    def test_clear_database(self, populated_db):
        """Test clearing the database."""
        with get_connection(populated_db) as conn:
            # Verify data exists
            initial_count = get_file_count(conn)
            assert initial_count > 0

        clear_database(populated_db)

        with get_connection(populated_db) as conn:
            # Verify data is cleared
            count = get_file_count(conn)
            assert count == 0

            # Schema version should still exist
            version = get_sync_state(conn, "schema_version")
            assert version is not None


@pytest.mark.unit
class TestDatabaseExists:
    """Tests for database_exists function."""

    def test_database_exists_true(self, initialized_db):
        """Test that initialized database is detected."""
        assert database_exists(initialized_db) is True

    def test_database_exists_false_no_file(self, tmp_path):
        """Test that non-existent database returns False."""
        assert database_exists(tmp_path / "nonexistent.db") is False

    def test_database_exists_false_uninitialized(self, tmp_path):
        """Test that empty database file returns False."""
        db_path = tmp_path / "empty.db"
        # Create empty file
        db_path.touch()

        assert database_exists(db_path) is False
