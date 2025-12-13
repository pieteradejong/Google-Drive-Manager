"""Tests for quick scan endpoint."""
import pytest
from unittest.mock import patch, MagicMock
from starlette.testclient import TestClient
from backend import main


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(main.app)


@pytest.mark.api
class TestQuickScanEndpoint:
    """Tests for /api/scan/quick endpoint."""
    
    @patch('backend.main.get_service')
    @patch('backend.main.get_drive_overview')
    @patch('backend.main.get_top_level_folders')
    def test_quick_scan_success(
        self,
        mock_get_top_folders,
        mock_get_overview,
        mock_get_service,
        client,
        sample_files
    ):
        """Test successful quick scan."""
        # Setup mocks
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        
        # Mock overview
        mock_get_overview.return_value = {
            "total_quota": "1000000000",
            "used": "500000000",
            "used_in_drive": "400000000",
            "user_email": "test@example.com",
            "user_display_name": "Test User"
        }
        
        # Mock top-level folders (only folders with no parents or root parent)
        top_folders = [
            f for f in sample_files 
            if f['mimeType'] == 'application/vnd.google-apps.folder' and not f.get('parents')
        ]
        # Add calculatedSize = 0 for quick scan
        for folder in top_folders:
            folder['calculatedSize'] = 0
        
        mock_get_top_folders.return_value = (top_folders, 1000)
        
        response = client.get("/api/scan/quick")
        
        assert response.status_code == 200, f"Response: {response.text}"
        data = response.json()
        
        assert 'overview' in data
        assert 'top_folders' in data
        assert 'estimated_total_files' in data
        
        assert data['overview']['user_email'] == "test@example.com"
        assert len(data['top_folders']) == 1  # Only folder1 has no parents
        assert data['estimated_total_files'] == 1000
    
    @patch('backend.main.get_service')
    @patch('backend.main.get_drive_overview')
    @patch('backend.main.get_top_level_folders')
    def test_quick_scan_empty_drive(
        self,
        mock_get_top_folders,
        mock_get_overview,
        mock_get_service,
        client
    ):
        """Test quick scan with empty Drive."""
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        
        mock_get_overview.return_value = {
            "total_quota": "1000000000",
            "used": "0",
            "used_in_drive": "0",
            "user_email": "test@example.com",
            "user_display_name": "Test User"
        }
        
        mock_get_top_folders.return_value = ([], None)
        
        response = client.get("/api/scan/quick")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data['top_folders'] == []
        assert data['estimated_total_files'] is None
    
    @patch('backend.main.get_service')
    def test_quick_scan_authentication_error(
        self,
        mock_get_service,
        client
    ):
        """Test quick scan handles authentication errors."""
        mock_get_service.side_effect = FileNotFoundError("credentials.json not found")
        
        response = client.get("/api/scan/quick")
        
        assert response.status_code == 500
        assert "credentials" in response.json()['detail'].lower()
    
    @patch('backend.main.get_service')
    @patch('backend.main.get_drive_overview')
    def test_quick_scan_api_error(
        self,
        mock_get_overview,
        mock_get_service,
        client
    ):
        """Test quick scan handles API errors."""
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        mock_get_overview.side_effect = Exception("API Error")
        
        response = client.get("/api/scan/quick")
        
        assert response.status_code == 500
        data = response.json()
        assert "Error in quick scan" in data['detail']


@pytest.mark.api
class TestFullScanEndpoints:
    """Tests for full scan endpoints."""
    
    @patch('backend.main.get_service')
    @patch('backend.main.list_all_files')
    @patch('backend.main.build_tree_structure')
    def test_start_full_scan(
        self,
        mock_build_tree,
        mock_list_files,
        mock_get_service,
        client,
        sample_files
    ):
        """Test starting a full scan returns scan_id."""
        # Clear any existing scan states
        main._scan_states.clear()
        
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        
        # Create copy to avoid modifying fixture
        files_copy = [f.copy() for f in sample_files]
        for f in files_copy:
            if f.get('size') and isinstance(f['size'], str):
                f['size'] = int(f['size'])
        
        mock_list_files.return_value = files_copy
        
        tree_data = {
            'files': files_copy,
            'file_map': {f['id']: f for f in files_copy},
            'children_map': {
                'folder1': ['file2', 'folder2'],
                'folder2': ['file3']
            }
        }
        mock_build_tree.return_value = tree_data
        
        response = client.post("/api/scan/full/start")
        
        assert response.status_code == 200
        data = response.json()
        
        assert 'scan_id' in data
        assert isinstance(data['scan_id'], str)
        assert len(data['scan_id']) > 0
        
        # Verify scan state was created
        assert data['scan_id'] in main._scan_states
    
    def test_get_scan_status_not_found(self, client):
        """Test getting status for non-existent scan."""
        response = client.get("/api/scan/full/status/nonexistent-id")
        
        assert response.status_code == 404
        assert "not found" in response.json()['detail'].lower()
    
    @patch('backend.main.get_service')
    @patch('backend.main.list_all_files')
    @patch('backend.main.build_tree_structure')
    def test_full_scan_progress(
        self,
        mock_build_tree,
        mock_list_files,
        mock_get_service,
        client,
        sample_files
    ):
        """Test full scan progress tracking."""
        import time
        import threading
        
        # Clear scan states
        main._scan_states.clear()
        
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        
        # Create copy to avoid modifying fixture
        files_copy = [f.copy() for f in sample_files]
        for f in files_copy:
            if f.get('size') and isinstance(f['size'], str):
                f['size'] = int(f['size'])
        
        mock_list_files.return_value = files_copy
        
        tree_data = {
            'files': files_copy,
            'file_map': {f['id']: f for f in files_copy},
            'children_map': {
                'folder1': ['file2', 'folder2'],
                'folder2': ['file3']
            }
        }
        mock_build_tree.return_value = tree_data
        
        # Start scan
        start_response = client.post("/api/scan/full/start")
        assert start_response.status_code == 200
        scan_id = start_response.json()['scan_id']
        
        # Wait a bit for scan to start
        time.sleep(0.5)
        
        # Check status
        status_response = client.get(f"/api/scan/full/status/{scan_id}")
        assert status_response.status_code == 200
        status_data = status_response.json()
        
        assert status_data['scan_id'] == scan_id
        assert 'status' in status_data
        assert 'progress' in status_data
        assert status_data['progress']['scan_id'] == scan_id
        
        # Wait for scan to complete (should be fast with mocks)
        max_wait = 10
        waited = 0
        while waited < max_wait:
            status_response = client.get(f"/api/scan/full/status/{scan_id}")
            status_data = status_response.json()
            if status_data['status'] == 'complete':
                break
            time.sleep(0.5)
            waited += 0.5
        
        # Final status check
        final_status = client.get(f"/api/scan/full/status/{scan_id}")
        assert final_status.status_code == 200
        final_data = final_status.json()
        
        # Verify scan completed or is still running (both are valid)
        assert final_data['status'] in ['complete', 'running']
        assert 'progress' in final_data
        assert final_data['progress']['scan_id'] == scan_id
        
        # If complete, verify result structure
        if final_data['status'] == 'complete':
            assert final_data['progress']['stage'] == 'complete'
            assert final_data['progress']['progress'] == 100.0
            assert final_data['result'] is not None
            assert 'files' in final_data['result']
            assert 'stats' in final_data['result']
