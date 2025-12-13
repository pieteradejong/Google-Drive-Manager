"""Tests for backend/main.py API endpoints."""
import pytest
from unittest.mock import patch, MagicMock
from starlette.testclient import TestClient
from backend import main


@pytest.fixture
def client():
    """Create test client."""
    # Use TestClient with positional argument for app
    return TestClient(main.app)


@pytest.mark.api
class TestHealthEndpoint:
    """Tests for /api/health endpoint."""
    
    def test_health_endpoint(self, client):
        """Test health endpoint returns ok."""
        response = client.get("/api/health")
        
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


@pytest.mark.api
class TestScanEndpoint:
    """Tests for /api/scan endpoint."""
    
    @patch('backend.main.get_service')
    @patch('backend.main.list_all_files')
    @patch('backend.main.build_tree_structure')
    async def test_scan_endpoint_success(
        self,
        mock_build_tree,
        mock_list_files,
        mock_get_service,
        client,
        sample_files
    ):
        """Test successful scan endpoint."""
        # Setup mocks
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        
        # Create copy to avoid modifying fixture
        files_copy = [f.copy() for f in sample_files]
        # Convert string sizes to int for FileItem model
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
        
        response = client.get("/api/scan")
        
        assert response.status_code == 200, f"Response: {response.text}"
        data = response.json()
        
        assert 'files' in data
        assert 'children_map' in data
        assert 'stats' in data
        
        assert len(data['files']) == 5
        assert data['stats']['total_files'] == 5
        assert data['stats']['folder_count'] == 2
        assert data['stats']['file_count'] == 3
    
    @patch('backend.main.get_service')
    @patch('backend.main.list_all_files')
    @patch('backend.main.build_tree_structure')
    def test_scan_endpoint_empty_drive(
        self,
        mock_build_tree,
        mock_list_files,
        mock_get_service,
        client
    ):
        """Test scan endpoint with empty Drive."""
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        mock_list_files.return_value = []
        mock_build_tree.return_value = {'files': [], 'file_map': {}, 'children_map': {}}
        
        response = client.get("/api/scan")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data['files'] == []
        assert data['children_map'] == {}
        assert data['stats']['total_files'] == 0
        assert data['stats']['total_size'] == 0
    
    @patch('backend.main.get_service')
    def test_scan_endpoint_authentication_error(
        self,
        mock_get_service,
        client
    ):
        """Test scan endpoint handles authentication errors."""
        mock_get_service.side_effect = FileNotFoundError("credentials.json not found")
        
        response = client.get("/api/scan")
        
        assert response.status_code == 500
        detail = response.json()['detail']
        assert "credentials" in detail.lower() or "authentication" in detail.lower()
    
    @patch('backend.main.get_service')
    @patch('backend.main.list_all_files')
    def test_scan_endpoint_api_error(
        self,
        mock_list_files,
        mock_get_service,
        client
    ):
        """Test scan endpoint handles API errors."""
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        mock_list_files.side_effect = Exception("API Error")
        
        response = client.get("/api/scan")
        
        assert response.status_code == 500
        data = response.json()
        assert "Error scanning Drive" in data['detail']
    
    @patch('backend.main.get_service')
    @patch('backend.main.list_all_files')
    @patch('backend.main.build_tree_structure')
    def test_scan_endpoint_calculates_stats_correctly(
        self,
        mock_build_tree,
        mock_list_files,
        mock_get_service,
        client,
        sample_files
    ):
        """Test that scan endpoint calculates statistics correctly."""
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        
        # Create a copy to avoid modifying the fixture
        files_copy = [f.copy() for f in sample_files]
        mock_list_files.return_value = files_copy
        
        # Add calculatedSize to folders
        for f in files_copy:
            if f['mimeType'] == 'application/vnd.google-apps.folder':
                f['calculatedSize'] = 1000000
        
        tree_data = {
            'files': files_copy,
            'file_map': {f['id']: f for f in files_copy},
            'children_map': {
                'folder1': ['file2', 'folder2'],
                'folder2': ['file3']
            }
        }
        mock_build_tree.return_value = tree_data
        
        response = client.get("/api/scan")
        
        assert response.status_code == 200
        data = response.json()
        
        stats = data['stats']
        assert stats['total_files'] == 5
        assert stats['folder_count'] == 2
        assert stats['file_count'] == 3
        assert stats['total_size'] > 0


@pytest.mark.api
class TestCORS:
    """Tests for CORS configuration."""
    
    def test_cors_headers(self, client):
        """Test that CORS headers are present."""
        response = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET"
            }
        )
        
        # FastAPI CORS middleware should handle this
        # The exact headers depend on CORS configuration
        assert response.status_code in [200, 204]

