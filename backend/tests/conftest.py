"""Pytest configuration and fixtures."""
import pytest
import json
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch
from google.oauth2.credentials import Credentials


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

