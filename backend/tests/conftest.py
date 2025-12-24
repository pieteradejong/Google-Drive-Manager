"""Pytest configuration and fixtures."""
import pytest
import json
import sqlite3
from pathlib import Path
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, MagicMock, patch
from google.oauth2.credentials import Credentials


# =============================================================================
# Google OAuth Fixtures
# =============================================================================

@pytest.fixture
def mock_credentials():
    """Mock Google OAuth credentials."""
    creds = Mock(spec=Credentials)
    creds.valid = True
    creds.expired = False
    creds.refresh_token = "mock_refresh_token"
    creds.to_json.return_value = json.dumps({
        "token": "mock_token",
        "refresh_token": "mock_refresh_token",
        "client_id": "mock_client_id",
        "client_secret": "mock_client_secret",
        "token_uri": "https://oauth2.googleapis.com/token"
    })
    return creds


@pytest.fixture
def mock_drive_service():
    """Mock Google Drive API service."""
    service = MagicMock()
    
    # Mock files().list() method
    mock_list = MagicMock()
    mock_execute = MagicMock()
    
    # Default empty response
    mock_execute.return_value = {
        'files': [],
        'nextPageToken': None
    }
    mock_list.execute = mock_execute
    mock_list.return_value = mock_list
    service.files.return_value.list = mock_list
    
    # Mock files().get() method
    mock_get = MagicMock()
    mock_get_execute = MagicMock()
    mock_get_execute.return_value = {
        'id': 'test_file_id',
        'name': 'test_file.txt',
        'mimeType': 'text/plain'
    }
    mock_get.execute = mock_get_execute
    service.files.return_value.get = mock_get
    
    return service


@pytest.fixture
def sample_files():
    """Sample file data for testing."""
    return [
        {
            'id': 'file1',
            'name': 'Document.pdf',
            'mimeType': 'application/pdf',
            'size': '1024',
            'parents': [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z',
            'webViewLink': 'https://drive.google.com/file/d/file1/view'
        },
        {
            'id': 'folder1',
            'name': 'My Folder',
            'mimeType': 'application/vnd.google-apps.folder',
            'size': None,
            'parents': [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z',
            'webViewLink': 'https://drive.google.com/drive/folders/folder1'
        },
        {
            'id': 'file2',
            'name': 'Image.jpg',
            'mimeType': 'image/jpeg',
            'size': '2048',
            'parents': ['folder1'],
            'createdTime': '2024-01-02T00:00:00Z',
            'modifiedTime': '2024-01-02T00:00:00Z',
            'webViewLink': 'https://drive.google.com/file/d/file2/view'
        },
        {
            'id': 'folder2',
            'name': 'Nested Folder',
            'mimeType': 'application/vnd.google-apps.folder',
            'size': None,
            'parents': ['folder1'],
            'createdTime': '2024-01-03T00:00:00Z',
            'modifiedTime': '2024-01-03T00:00:00Z',
            'webViewLink': 'https://drive.google.com/drive/folders/folder2'
        },
        {
            'id': 'file3',
            'name': 'Video.mp4',
            'mimeType': 'video/mp4',
            'size': '1048576',
            'parents': ['folder2'],
            'createdTime': '2024-01-04T00:00:00Z',
            'modifiedTime': '2024-01-04T00:00:00Z',
            'webViewLink': 'https://drive.google.com/file/d/file3/view'
        }
    ]


@pytest.fixture
def credentials_path(tmp_path):
    """Create a temporary credentials.json file."""
    creds_file = tmp_path / 'credentials.json'
    creds_data = {
        "installed": {
            "client_id": "test_client_id",
            "client_secret": "test_client_secret",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token"
        }
    }
    creds_file.write_text(json.dumps(creds_data))
    return creds_file


@pytest.fixture
def token_path(tmp_path):
    """Create a temporary token.json file."""
    token_file = tmp_path / 'token.json'
    token_data = {
        "token": "test_token",
        "refresh_token": "test_refresh_token",
        "client_id": "test_client_id",
        "client_secret": "test_client_secret",
        "token_uri": "https://oauth2.googleapis.com/token"
    }
    token_file.write_text(json.dumps(token_data))
    return token_file


# =============================================================================
# Drive API Mock Fixtures
# =============================================================================

@pytest.fixture
def mock_about_response():
    """Mock response from about().get() endpoint."""
    return {
        'storageQuota': {
            'limit': '16106127360',
            'usage': '5368709120',
            'usageInDrive': '4294967296',
            'usageInDriveTrash': '0'
        },
        'user': {
            'emailAddress': 'test@example.com',
            'displayName': 'Test User',
            'photoLink': 'https://example.com/photo.jpg'
        }
    }


@pytest.fixture
def mock_changes_response():
    """Mock response from changes().list() endpoint."""
    return {
        'changes': [
            {
                'fileId': 'new_file_1',
                'removed': False,
                'file': {
                    'id': 'new_file_1',
                    'name': 'NewDocument.pdf',
                    'mimeType': 'application/pdf',
                    'size': '2048',
                    'parents': ['folder1'],
                    'createdTime': '2024-01-15T00:00:00Z',
                    'modifiedTime': '2024-01-15T00:00:00Z',
                    'md5Checksum': 'abc123',
                    'ownedByMe': True
                }
            },
            {
                'fileId': 'modified_file',
                'removed': False,
                'file': {
                    'id': 'modified_file',
                    'name': 'ModifiedFile.txt',
                    'mimeType': 'text/plain',
                    'size': '1024',
                    'parents': [],
                    'modifiedTime': '2024-01-16T00:00:00Z'
                }
            },
            {
                'fileId': 'deleted_file',
                'removed': True
            }
        ],
        'newStartPageToken': 'new_token_123'
    }


@pytest.fixture
def sample_files_full():
    """
    Sample file data with FULL_FIELDS metadata for testing.
    Includes all fields from the Drive API full response.
    """
    return [
        {
            'id': 'file1',
            'name': 'Document.pdf',
            'mimeType': 'application/pdf',
            'size': '1024',
            'parents': [],
            'trashed': False,
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z',
            'md5Checksum': 'abc123def456',
            'ownedByMe': True,
            'owners': [{'displayName': 'Test User', 'emailAddress': 'test@example.com'}],
            'capabilities': {'canTrash': True, 'canDelete': False},
            'starred': False,
            'webViewLink': 'https://drive.google.com/file/d/file1/view',
            'iconLink': 'https://drive.google.com/icon.png'
        },
        {
            'id': 'folder1',
            'name': 'My Folder',
            'mimeType': 'application/vnd.google-apps.folder',
            'size': None,
            'parents': [],
            'trashed': False,
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z',
            'ownedByMe': True,
            'owners': [{'displayName': 'Test User', 'emailAddress': 'test@example.com'}],
            'capabilities': {'canAddChildren': True, 'canRemoveChildren': True},
            'starred': False,
            'webViewLink': 'https://drive.google.com/drive/folders/folder1'
        },
        {
            'id': 'file2',
            'name': 'Image.jpg',
            'mimeType': 'image/jpeg',
            'size': '2048',
            'parents': ['folder1'],
            'trashed': False,
            'createdTime': '2024-01-02T00:00:00Z',
            'modifiedTime': '2024-01-02T00:00:00Z',
            'md5Checksum': 'def789ghi012',
            'ownedByMe': True,
            'owners': [{'displayName': 'Test User', 'emailAddress': 'test@example.com'}],
            'capabilities': {'canTrash': True, 'canDelete': True},
            'starred': True,
            'webViewLink': 'https://drive.google.com/file/d/file2/view'
        },
        {
            'id': 'folder2',
            'name': 'Nested Folder',
            'mimeType': 'application/vnd.google-apps.folder',
            'size': None,
            'parents': ['folder1'],
            'trashed': False,
            'createdTime': '2024-01-03T00:00:00Z',
            'modifiedTime': '2024-01-03T00:00:00Z',
            'ownedByMe': True,
            'starred': False,
            'webViewLink': 'https://drive.google.com/drive/folders/folder2'
        },
        {
            'id': 'file3',
            'name': 'Video.mp4',
            'mimeType': 'video/mp4',
            'size': '1048576',
            'parents': ['folder2'],
            'trashed': False,
            'createdTime': '2024-01-04T00:00:00Z',
            'modifiedTime': '2024-01-04T00:00:00Z',
            'md5Checksum': 'xyz789abc123',
            'ownedByMe': True,
            'starred': False,
            'webViewLink': 'https://drive.google.com/file/d/file3/view'
        },
        {
            'id': 'shortcut1',
            'name': 'Shortcut to Document',
            'mimeType': 'application/vnd.google-apps.shortcut',
            'parents': [],
            'trashed': False,
            'createdTime': '2024-01-05T00:00:00Z',
            'modifiedTime': '2024-01-05T00:00:00Z',
            'shortcutDetails': {
                'targetId': 'file1',
                'targetMimeType': 'application/pdf'
            },
            'ownedByMe': True,
            'webViewLink': 'https://drive.google.com/file/d/shortcut1/view'
        }
    ]


@pytest.fixture
def sample_files_with_duplicates():
    """Sample files with duplicates for analytics testing."""
    return [
        {
            'id': 'dup1_a',
            'name': 'Report.pdf',
            'mimeType': 'application/pdf',
            'size': '5000',
            'parents': ['folder_work'],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z'
        },
        {
            'id': 'dup1_b',
            'name': 'Report.pdf',
            'mimeType': 'application/pdf',
            'size': '5000',
            'parents': ['folder_backup'],
            'createdTime': '2024-01-02T00:00:00Z',
            'modifiedTime': '2024-01-02T00:00:00Z'
        },
        {
            'id': 'dup1_c',
            'name': 'Report.pdf',
            'mimeType': 'application/pdf',
            'size': '5000',
            'parents': ['folder_old'],
            'createdTime': '2024-01-03T00:00:00Z',
            'modifiedTime': '2024-01-03T00:00:00Z'
        },
        {
            'id': 'unique1',
            'name': 'UniqueFile.txt',
            'mimeType': 'text/plain',
            'size': '100',
            'parents': [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z'
        },
        {
            'id': 'folder_work',
            'name': 'Work',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z'
        },
        {
            'id': 'folder_backup',
            'name': 'Backup',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z'
        },
        {
            'id': 'folder_old',
            'name': 'Old Files',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z'
        },
        {
            'id': 'folder_photos',
            'name': 'Photos',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z'
        }
    ]


@pytest.fixture
def comprehensive_drive_service(sample_files_full, mock_about_response, mock_changes_response):
    """
    Comprehensive mock of Google Drive API service.
    Supports all common API methods with configurable responses.
    """
    service = MagicMock()
    
    # Mock files().list()
    def create_list_mock():
        mock = MagicMock()
        mock.execute.return_value = {
            'files': sample_files_full,
            'nextPageToken': None
        }
        return mock
    
    service.files.return_value.list = create_list_mock
    
    # Mock files().get()
    def create_get_mock():
        mock = MagicMock()
        mock.execute.return_value = sample_files_full[0]
        return mock
    
    service.files.return_value.get = create_get_mock
    
    # Mock about().get()
    def create_about_get_mock():
        mock = MagicMock()
        mock.execute.return_value = mock_about_response
        return mock
    
    service.about.return_value.get = create_about_get_mock
    
    # Mock changes().getStartPageToken()
    def create_start_token_mock():
        mock = MagicMock()
        mock.execute.return_value = {'startPageToken': 'initial_token_123'}
        return mock
    
    service.changes.return_value.getStartPageToken = create_start_token_mock
    
    # Mock changes().list()
    def create_changes_list_mock():
        mock = MagicMock()
        mock.execute.return_value = mock_changes_response
        return mock
    
    service.changes.return_value.list = create_changes_list_mock
    
    return service


# =============================================================================
# SQLite Database Fixtures
# =============================================================================

@pytest.fixture
def temp_db_path(tmp_path):
    """Create a temporary database path for testing."""
    db_path = tmp_path / 'test_drive_index.db'
    return db_path


@pytest.fixture
def initialized_db(temp_db_path):
    """Create and initialize a temporary database."""
    from backend.index_db import init_db, get_connection
    
    init_db(temp_db_path)
    return temp_db_path


@pytest.fixture
def populated_db(initialized_db, sample_files_full):
    """Create a database populated with sample files."""
    from backend.index_db import get_connection, upsert_file, replace_parents, set_sync_state
    
    with get_connection(initialized_db) as conn:
        for file_dict in sample_files_full:
            upsert_file(conn, file_dict)
            file_id = file_dict.get('id')
            parents = file_dict.get('parents', [])
            if file_id:
                replace_parents(conn, file_id, parents)
        
        # Set sync state
        set_sync_state(conn, 'start_page_token', 'test_token_123')
        set_sync_state(conn, 'last_full_crawl_time', datetime.now(timezone.utc).isoformat())
        conn.commit()
    
    return initialized_db


# =============================================================================
# Analytics Fixtures
# =============================================================================

@pytest.fixture
def sample_scan_data(sample_files):
    """Create sample scan data structure for analytics testing."""
    # Build children_map from sample files
    children_map = {}
    for file in sample_files:
        parents = file.get('parents', [])
        for parent in parents:
            if parent not in children_map:
                children_map[parent] = []
            children_map[parent].append(file['id'])
    
    return {
        'files': sample_files,
        'children_map': children_map,
        'stats': {
            'total_files': len(sample_files),
            'total_size': sum(int(f.get('size') or 0) for f in sample_files),
            'folder_count': len([f for f in sample_files if f['mimeType'] == 'application/vnd.google-apps.folder']),
            'file_count': len([f for f in sample_files if f['mimeType'] != 'application/vnd.google-apps.folder'])
        }
    }


@pytest.fixture
def sample_scan_data_with_duplicates(sample_files_with_duplicates):
    """Create scan data with duplicates for analytics testing."""
    children_map = {}
    for file in sample_files_with_duplicates:
        parents = file.get('parents', [])
        for parent in parents:
            if parent not in children_map:
                children_map[parent] = []
            children_map[parent].append(file['id'])
    
    return {
        'files': sample_files_with_duplicates,
        'children_map': children_map,
        'stats': {
            'total_files': len(sample_files_with_duplicates),
            'total_size': sum(int(f.get('size') or 0) for f in sample_files_with_duplicates),
            'folder_count': len([f for f in sample_files_with_duplicates if f.get('mimeType') == 'application/vnd.google-apps.folder']),
            'file_count': len([f for f in sample_files_with_duplicates if f.get('mimeType') != 'application/vnd.google-apps.folder'])
        }
    }


@pytest.fixture
def sample_deep_folder_structure():
    """Create files with deep folder nesting for depth testing."""
    files = []
    
    # Create a chain of nested folders (depth 5)
    for i in range(5):
        folder = {
            'id': f'nested_folder_{i}',
            'name': f'Level {i}',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [f'nested_folder_{i-1}'] if i > 0 else [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z'
        }
        files.append(folder)
    
    # Add a file at the deepest level
    files.append({
        'id': 'deep_file',
        'name': 'DeepFile.txt',
        'mimeType': 'text/plain',
        'size': '100',
        'parents': ['nested_folder_4'],
        'createdTime': '2024-01-01T00:00:00Z',
        'modifiedTime': '2024-01-01T00:00:00Z'
    })
    
    return files


@pytest.fixture
def sample_semantic_folders():
    """Create folders with semantic category names for testing."""
    return [
        {
            'id': 'folder_photos',
            'name': 'Photos 2024',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z'
        },
        {
            'id': 'folder_backup',
            'name': 'Old Backup',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [],
            'createdTime': '2020-01-01T00:00:00Z',
            'modifiedTime': '2020-06-01T00:00:00Z'
        },
        {
            'id': 'folder_work',
            'name': 'Work Projects',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-15T00:00:00Z'
        },
        {
            'id': 'folder_personal',
            'name': 'Personal Documents',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-10T00:00:00Z'
        },
        {
            'id': 'folder_music',
            'name': 'My Music Collection',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-05T00:00:00Z'
        },
        {
            'id': 'folder_code',
            'name': 'Development Projects',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-20T00:00:00Z'
        },
        {
            'id': 'img1',
            'name': 'photo1.jpg',
            'mimeType': 'image/jpeg',
            'size': '2000',
            'parents': ['folder_photos'],
            'createdTime': '2024-01-01T00:00:00Z',
            'modifiedTime': '2024-01-01T00:00:00Z'
        },
        {
            'id': 'img2',
            'name': 'photo2.jpg',
            'mimeType': 'image/jpeg',
            'size': '3000',
            'parents': ['folder_photos'],
            'createdTime': '2024-01-02T00:00:00Z',
            'modifiedTime': '2024-01-02T00:00:00Z'
        },
        {
            'id': 'img3',
            'name': 'photo3.jpg',
            'mimeType': 'image/jpeg',
            'size': '2500',
            'parents': ['folder_photos'],
            'createdTime': '2024-01-03T00:00:00Z',
            'modifiedTime': '2024-01-03T00:00:00Z'
        }
    ]


# =============================================================================
# Cache Fixtures
# =============================================================================

@pytest.fixture
def temp_cache_dir(tmp_path):
    """Create a temporary cache directory."""
    cache_dir = tmp_path / 'cache'
    cache_dir.mkdir()
    return cache_dir


@pytest.fixture
def valid_cache_metadata():
    """Create valid cache metadata (fresh)."""
    from backend.cache import CacheMetadata
    return CacheMetadata(
        timestamp=datetime.now(timezone.utc).isoformat(),
        file_count=100,
        total_size=1048576,
        cache_version=1
    )


@pytest.fixture
def expired_cache_metadata():
    """Create expired cache metadata (30 days old)."""
    from backend.cache import CacheMetadata
    return CacheMetadata(
        timestamp=(datetime.now(timezone.utc) - timedelta(days=30)).isoformat(),
        file_count=100,
        total_size=1048576,
        cache_version=1
    )

