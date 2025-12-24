"""Tests for backend/drive_api.py."""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, call
from backend.drive_api import (
    list_all_files,
    build_tree_structure,
    get_drive_overview,
    get_top_level_folders,
    check_recently_modified,
    list_all_files_full,
    get_start_page_token,
    list_changes,
    get_file_metadata,
    FULL_FIELDS,
    CHANGES_FIELDS,
)


@pytest.mark.unit
class TestListAllFiles:
    """Tests for list_all_files function."""

    def test_list_all_files_empty(self, mock_drive_service):
        """Test listing files when Drive is empty."""
        files = list_all_files(mock_drive_service)
        assert files == []
        assert mock_drive_service.files().list.called

    def test_list_all_files_single_page(self, mock_drive_service, sample_files):
        """Test listing files with single page of results."""
        # Configure mock to return files
        mock_execute = mock_drive_service.files().list().execute
        mock_execute.return_value = {"files": sample_files[:2], "nextPageToken": None}

        files = list_all_files(mock_drive_service)
        assert len(files) == 2
        assert files[0]["id"] == "file1"
        assert files[1]["id"] == "folder1"

    def test_list_all_files_multiple_pages(self, mock_drive_service, sample_files):
        """Test listing files with pagination."""
        # First page
        first_page = MagicMock()
        first_page.execute.return_value = {
            "files": sample_files[:2],
            "nextPageToken": "token123",
        }

        # Second page
        second_page = MagicMock()
        second_page.execute.return_value = {
            "files": sample_files[2:],
            "nextPageToken": None,
        }

        # Configure mock to return different pages
        mock_list = MagicMock()
        mock_list.side_effect = [first_page, second_page]
        mock_drive_service.files.return_value.list = mock_list

        files = list_all_files(mock_drive_service)
        assert len(files) == 5
        assert mock_list.call_count == 2

    def test_list_all_files_error_handling(self, mock_drive_service):
        """Test error handling in list_all_files."""
        mock_drive_service.files().list().execute.side_effect = Exception("API Error")

        files = list_all_files(mock_drive_service)
        # Should return empty list on error
        assert files == []


@pytest.mark.unit
class TestBuildTreeStructure:
    """Tests for build_tree_structure function."""

    def test_build_tree_structure_empty(self):
        """Test building tree with empty file list."""
        result = build_tree_structure([])

        assert result["files"] == []
        assert result["file_map"] == {}
        assert result["children_map"] == {}

    def test_build_tree_structure_simple(self, sample_files):
        """Test building tree with simple structure."""
        files = sample_files[:3]  # file1, folder1, file2
        result = build_tree_structure(files)

        assert len(result["files"]) == 3
        assert "file1" in result["file_map"]
        assert "folder1" in result["file_map"]
        assert "file2" in result["file_map"]

        # Check children_map
        assert "folder1" in result["children_map"]
        assert "file2" in result["children_map"]["folder1"]

    def test_build_tree_structure_nested(self, sample_files):
        """Test building tree with nested folders."""
        result = build_tree_structure(sample_files)

        # Check root items (no parents)
        root_items = [f for f in result["files"] if not f.get("parents")]
        assert len(root_items) == 2  # file1 and folder1

        # Check nested structure
        assert "folder1" in result["children_map"]
        assert "folder2" in result["children_map"]["folder1"]
        assert "file2" in result["children_map"]["folder1"]
        assert "file3" in result["children_map"]["folder2"]

    def test_calculate_folder_sizes(self, sample_files):
        """Test folder size calculation."""
        result = build_tree_structure(sample_files)

        # Find folder1
        folder1 = next(f for f in result["files"] if f["id"] == "folder1")

        # folder1 should have calculatedSize including:
        # - file2: 2048
        # - folder2: calculatedSize (which includes file3: 1048576)
        # Total should be at least file2 + file3 = 2048 + 1048576 = 1050624
        assert "calculatedSize" in folder1
        assert folder1["calculatedSize"] >= 1050624

        # Find folder2
        folder2 = next(f for f in result["files"] if f["id"] == "folder2")
        assert "calculatedSize" in folder2
        assert folder2["calculatedSize"] == 1048576  # Just file3

    def test_calculate_file_sizes(self, sample_files):
        """Test that files have their direct size."""
        result = build_tree_structure(sample_files)

        file1 = next(f for f in result["files"] if f["id"] == "file1")
        # Files shouldn't have calculatedSize, they have direct size
        assert file1.get("size") == "1024" or int(file1.get("size", 0)) == 1024

    def test_multiple_parents(self):
        """Test handling files with multiple parents (shared files)."""
        files = [
            {
                "id": "shared_file",
                "name": "Shared.txt",
                "mimeType": "text/plain",
                "size": "512",
                "parents": ["folder1", "folder2"],
                "createdTime": "2024-01-01T00:00:00Z",
                "modifiedTime": "2024-01-01T00:00:00Z",
                "webViewLink": "https://drive.google.com/file/d/shared_file/view",
            },
            {
                "id": "folder1",
                "name": "Folder 1",
                "mimeType": "application/vnd.google-apps.folder",
                "size": None,
                "parents": [],
                "createdTime": "2024-01-01T00:00:00Z",
                "modifiedTime": "2024-01-01T00:00:00Z",
                "webViewLink": "https://drive.google.com/drive/folders/folder1",
            },
            {
                "id": "folder2",
                "name": "Folder 2",
                "mimeType": "application/vnd.google-apps.folder",
                "size": None,
                "parents": [],
                "createdTime": "2024-01-01T00:00:00Z",
                "modifiedTime": "2024-01-01T00:00:00Z",
                "webViewLink": "https://drive.google.com/drive/folders/folder2",
            },
        ]

        result = build_tree_structure(files)

        # Shared file should appear in both folders' children
        assert "shared_file" in result["children_map"]["folder1"]
        assert "shared_file" in result["children_map"]["folder2"]


@pytest.mark.unit
class TestGetDriveOverview:
    """Tests for get_drive_overview function."""

    def test_get_drive_overview_success(self, mock_about_response):
        """Test successful drive overview retrieval."""
        service = MagicMock()
        service.about.return_value.get.return_value.execute.return_value = (
            mock_about_response
        )

        result = get_drive_overview(service)

        assert result["total_quota"] == "16106127360"
        assert result["used"] == "5368709120"
        assert result["used_in_drive"] == "4294967296"
        assert result["user_email"] == "test@example.com"
        assert result["user_display_name"] == "Test User"

    def test_get_drive_overview_empty_quota(self):
        """Test drive overview with missing quota info."""
        service = MagicMock()
        service.about.return_value.get.return_value.execute.return_value = {
            "storageQuota": {},
            "user": {},
        }

        result = get_drive_overview(service)

        assert result["total_quota"] is None
        assert result["used"] is None
        assert result["user_email"] is None

    def test_get_drive_overview_calls_api_correctly(self):
        """Test that about.get is called with correct fields."""
        service = MagicMock()
        service.about.return_value.get.return_value.execute.return_value = {
            "storageQuota": {},
            "user": {},
        }

        get_drive_overview(service)

        service.about.return_value.get.assert_called_once_with(
            fields="storageQuota,user"
        )


@pytest.mark.unit
class TestGetTopLevelFolders:
    """Tests for get_top_level_folders function."""

    def test_get_top_level_folders_success(self):
        """Test successful top-level folder retrieval."""
        service = MagicMock()

        # Mock first call for estimation
        first_page_mock = MagicMock()
        first_page_mock.execute.return_value = {
            "files": [{"id": f"file{i}"} for i in range(10)],
            "nextPageToken": None,
        }

        # Mock second call for actual folders
        folders_mock = MagicMock()
        folders_mock.execute.return_value = {
            "files": [
                {
                    "id": "folder1",
                    "name": "My Folder",
                    "mimeType": "application/vnd.google-apps.folder",
                    "parents": ["root"],
                    "size": None,
                },
                {
                    "id": "folder2",
                    "name": "Other Folder",
                    "mimeType": "application/vnd.google-apps.folder",
                    "parents": ["root"],
                    "size": None,
                },
            ],
            "nextPageToken": None,
        }

        service.files.return_value.list.side_effect = [first_page_mock, folders_mock]

        folders, estimated_total = get_top_level_folders(service)

        assert len(folders) == 2
        assert folders[0]["id"] == "folder1"
        assert folders[1]["id"] == "folder2"
        # calculatedSize should be set to 0 for quick scan
        assert folders[0].get("calculatedSize") == 0

    def test_get_top_level_folders_with_pagination(self):
        """Test folder retrieval with multiple pages."""
        service = MagicMock()

        # First call for estimation (has more pages)
        first_page_mock = MagicMock()
        first_page_mock.execute.return_value = {
            "files": [{"id": f"file{i}"} for i in range(1000)],
            "nextPageToken": "more_files",
        }

        # Second call - first page of folders
        page1_mock = MagicMock()
        page1_mock.execute.return_value = {
            "files": [
                {
                    "id": "folder1",
                    "name": "F1",
                    "mimeType": "application/vnd.google-apps.folder",
                }
            ],
            "nextPageToken": "page2",
        }

        # Third call - second page of folders
        page2_mock = MagicMock()
        page2_mock.execute.return_value = {
            "files": [
                {
                    "id": "folder2",
                    "name": "F2",
                    "mimeType": "application/vnd.google-apps.folder",
                }
            ],
            "nextPageToken": None,
        }

        service.files.return_value.list.side_effect = [
            first_page_mock,
            page1_mock,
            page2_mock,
        ]

        folders, estimated_total = get_top_level_folders(service)

        assert len(folders) == 2
        assert estimated_total == 1000

    def test_get_top_level_folders_empty(self):
        """Test when there are no top-level folders."""
        service = MagicMock()

        empty_mock = MagicMock()
        empty_mock.execute.return_value = {"files": [], "nextPageToken": None}

        service.files.return_value.list.side_effect = [empty_mock, empty_mock]

        folders, estimated_total = get_top_level_folders(service)

        assert folders == []


@pytest.mark.unit
class TestCheckRecentlyModified:
    """Tests for check_recently_modified function."""

    def test_check_recently_modified_no_changes(self):
        """Test when no files have been modified."""
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [],
            "nextPageToken": None,
        }

        since = datetime.now(timezone.utc) - timedelta(hours=1)
        result = check_recently_modified(service, since, limit=1)

        assert result == []

    def test_check_recently_modified_has_changes(self):
        """Test when files have been modified."""
        service = MagicMock()
        modified_file = {
            "id": "file123",
            "name": "modified.txt",
            "modifiedTime": datetime.now(timezone.utc).isoformat(),
        }
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [modified_file],
            "nextPageToken": None,
        }

        since = datetime.now(timezone.utc) - timedelta(hours=1)
        result = check_recently_modified(service, since, limit=1)

        assert len(result) == 1
        assert result[0]["id"] == "file123"

    def test_check_recently_modified_uses_correct_query(self):
        """Test that the correct query is used."""
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [],
            "nextPageToken": None,
        }

        since = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        check_recently_modified(service, since, limit=5)

        # Check that list was called with correct parameters
        call_kwargs = service.files.return_value.list.call_args[1]
        assert "modifiedTime > '2024-01-15T10:30:00'" in call_kwargs["q"]
        assert call_kwargs["pageSize"] == 5

    def test_check_recently_modified_handles_error(self):
        """Test error handling returns empty list."""
        service = MagicMock()
        service.files.return_value.list.return_value.execute.side_effect = Exception(
            "API Error"
        )

        since = datetime.now(timezone.utc) - timedelta(hours=1)
        result = check_recently_modified(service, since)

        assert result == []


@pytest.mark.unit
class TestListAllFilesFull:
    """Tests for list_all_files_full function."""

    def test_list_all_files_full_success(self, sample_files_full):
        """Test successful full file listing with all metadata."""
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": sample_files_full,
            "nextPageToken": None,
        }

        result = list_all_files_full(service)

        assert len(result) == len(sample_files_full)
        # Check that full metadata fields are present
        assert "md5Checksum" in result[0] or "ownedByMe" in result[0]

    def test_list_all_files_full_with_progress_callback(self, sample_files_full):
        """Test progress callback is invoked."""
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": sample_files_full,
            "nextPageToken": None,
        }

        progress_calls = []

        def progress_callback(files_count, page_count):
            progress_calls.append((files_count, page_count))

        list_all_files_full(service, progress_callback=progress_callback)

        assert len(progress_calls) >= 1
        # Last call should have all files
        assert progress_calls[-1][0] == len(sample_files_full)

    def test_list_all_files_full_pagination(self, sample_files_full):
        """Test pagination handling."""
        service = MagicMock()

        # Split files into two pages
        page1_files = sample_files_full[:3]
        page2_files = sample_files_full[3:]

        page1_mock = MagicMock()
        page1_mock.execute.return_value = {
            "files": page1_files,
            "nextPageToken": "page2_token",
        }

        page2_mock = MagicMock()
        page2_mock.execute.return_value = {"files": page2_files, "nextPageToken": None}

        service.files.return_value.list.side_effect = [page1_mock, page2_mock]

        result = list_all_files_full(service)

        assert len(result) == len(sample_files_full)

    def test_list_all_files_full_uses_full_fields(self):
        """Test that FULL_FIELDS is used."""
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [],
            "nextPageToken": None,
        }

        list_all_files_full(service)

        call_kwargs = service.files.return_value.list.call_args[1]
        assert call_kwargs["fields"] == FULL_FIELDS

    def test_list_all_files_full_include_trashed(self):
        """Test including trashed files."""
        service = MagicMock()
        service.files.return_value.list.return_value.execute.return_value = {
            "files": [],
            "nextPageToken": None,
        }

        list_all_files_full(service, include_trashed=True)

        call_kwargs = service.files.return_value.list.call_args[1]
        # When include_trashed=True, no query should be passed
        assert "q" not in call_kwargs or call_kwargs.get("q") is None

    def test_list_all_files_full_error_propagates(self):
        """Test that errors are raised (not swallowed)."""
        service = MagicMock()
        service.files.return_value.list.return_value.execute.side_effect = Exception(
            "API Error"
        )

        with pytest.raises(Exception, match="API Error"):
            list_all_files_full(service)


@pytest.mark.unit
class TestGetStartPageToken:
    """Tests for get_start_page_token function."""

    def test_get_start_page_token_success(self):
        """Test successful token retrieval."""
        service = MagicMock()
        service.changes.return_value.getStartPageToken.return_value.execute.return_value = {
            "startPageToken": "token123"
        }

        result = get_start_page_token(service)

        assert result == "token123"

    def test_get_start_page_token_error(self):
        """Test error handling."""
        service = MagicMock()
        service.changes.return_value.getStartPageToken.return_value.execute.side_effect = Exception(
            "API Error"
        )

        with pytest.raises(Exception, match="API Error"):
            get_start_page_token(service)


@pytest.mark.unit
class TestListChanges:
    """Tests for list_changes function."""

    def test_list_changes_success(self, mock_changes_response):
        """Test successful changes listing."""
        service = MagicMock()
        service.changes.return_value.list.return_value.execute.return_value = (
            mock_changes_response
        )

        changes, new_token = list_changes(service, "old_token")

        assert len(changes) == 3
        assert new_token == "new_token_123"
        # Check change types
        added = [c for c in changes if not c.get("removed", False)]
        removed = [c for c in changes if c.get("removed", False)]
        assert len(added) == 2
        assert len(removed) == 1

    def test_list_changes_with_progress_callback(self, mock_changes_response):
        """Test progress callback is invoked."""
        service = MagicMock()
        service.changes.return_value.list.return_value.execute.return_value = (
            mock_changes_response
        )

        progress_calls = []

        def progress_callback(changes_count, page_count):
            progress_calls.append((changes_count, page_count))

        list_changes(service, "token", progress_callback=progress_callback)

        assert len(progress_calls) >= 1

    def test_list_changes_pagination(self, mock_changes_response):
        """Test pagination handling."""
        service = MagicMock()

        # First page with nextPageToken
        page1 = {
            "changes": mock_changes_response["changes"][:1],
            "nextPageToken": "page2_token",
        }

        # Second page with newStartPageToken (final)
        page2 = {
            "changes": mock_changes_response["changes"][1:],
            "newStartPageToken": "final_token",
        }

        page1_mock = MagicMock()
        page1_mock.execute.return_value = page1

        page2_mock = MagicMock()
        page2_mock.execute.return_value = page2

        service.changes.return_value.list.side_effect = [page1_mock, page2_mock]

        changes, new_token = list_changes(service, "initial_token")

        assert len(changes) == 3
        assert new_token == "final_token"

    def test_list_changes_empty(self):
        """Test when no changes exist."""
        service = MagicMock()
        service.changes.return_value.list.return_value.execute.return_value = {
            "changes": [],
            "newStartPageToken": "same_token",
        }

        changes, new_token = list_changes(service, "token")

        assert changes == []
        assert new_token == "same_token"

    def test_list_changes_uses_changes_fields(self):
        """Test that CHANGES_FIELDS is used."""
        service = MagicMock()
        service.changes.return_value.list.return_value.execute.return_value = {
            "changes": [],
            "newStartPageToken": "token",
        }

        list_changes(service, "page_token")

        call_kwargs = service.changes.return_value.list.call_args[1]
        assert call_kwargs["fields"] == CHANGES_FIELDS


@pytest.mark.unit
class TestGetFileMetadata:
    """Tests for get_file_metadata function."""

    def test_get_file_metadata_success(self):
        """Test successful file metadata retrieval."""
        service = MagicMock()
        expected_file = {
            "id": "file123",
            "name": "test.txt",
            "mimeType": "text/plain",
            "size": "1024",
        }
        service.files.return_value.get.return_value.execute.return_value = expected_file

        result = get_file_metadata(service, "file123")

        assert result == expected_file
        service.files.return_value.get.assert_called_once_with(
            fileId="file123", fields="*"
        )
