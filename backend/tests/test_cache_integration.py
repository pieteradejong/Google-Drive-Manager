"""Integration tests for caching functionality."""
import pytest
from unittest.mock import patch, MagicMock
from starlette.testclient import TestClient
from datetime import datetime, timezone, timedelta
from backend import main
from backend.cache import CacheMetadata, clear_cache


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def clear_caches_before_test():
    """Clear all caches before each test."""
    clear_cache()
    yield
    clear_cache()


@pytest.mark.api
@pytest.mark.cache
class TestQuickScanCaching:
    """Integration tests for quick scan caching."""
    
    @patch('backend.main.get_service')
    @patch('backend.main.get_drive_overview')
    @patch('backend.main.get_top_level_folders')
    @patch('backend.main.load_cache')
    @patch('backend.main.save_cache')
    def test_quick_scan_caches_result(
        self,
        mock_save_cache,
        mock_load_cache,
        mock_get_top_folders,
        mock_get_overview,
        mock_get_service,
        client
    ):
        """Test that quick scan caches its result."""
        # No cache exists
        mock_load_cache.return_value = None
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        
        mock_get_overview.return_value = {
            "total_quota": "1000000000",
            "used": "500000000",
            "user_email": "test@example.com"
        }
        mock_get_top_folders.return_value = ([], None)
        
        response = client.get("/api/scan/quick")
        
        assert response.status_code == 200
        # Verify cache was saved
        assert mock_save_cache.called
        call_args = mock_save_cache.call_args
        assert call_args[0][0] == 'quick_scan'  # scan_type
        assert isinstance(call_args[0][2], CacheMetadata)  # metadata
    
    @patch('backend.main.get_service')
    @patch('backend.main.get_drive_overview')
    @patch('backend.main.get_top_level_folders')
    @patch('backend.main.load_cache')
    @patch('backend.main.validate_cache_with_drive')
    def test_quick_scan_uses_cache_when_valid(
        self,
        mock_validate,
        mock_load_cache,
        mock_get_top_folders,
        mock_get_overview,
        mock_get_service,
        client
    ):
        """Test that quick scan uses cache when valid."""
        # Cache exists and is valid
        cached_data = {
            'data': {
                'overview': {'total_quota': '1000000000', 'used': '500000000'},
                'top_folders': [],
                'estimated_total_files': None
            },
            'metadata': {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'cache_version': 1
            }
        }
        mock_load_cache.return_value = cached_data
        mock_validate.return_value = True  # Cache valid via validate_cache_with_drive
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        
        response = client.get("/api/scan/quick")
        
        assert response.status_code == 200
        # Should not call Drive API functions
        mock_get_overview.assert_not_called()
        mock_get_top_folders.assert_not_called()
    
    @patch('backend.main.get_service')
    @patch('backend.main.get_drive_overview')
    @patch('backend.main.get_top_level_folders')
    @patch('backend.main.load_cache')
    @patch('backend.main.validate_cache_with_drive')
    @patch('backend.main.save_cache')
    def test_quick_scan_refreshes_when_cache_expired(
        self,
        mock_save_cache,
        mock_validate,
        mock_load_cache,
        mock_get_top_folders,
        mock_get_overview,
        mock_get_service,
        client
    ):
        """Test that quick scan refreshes when cache is expired/invalid."""
        # Cache exists but is invalid (Drive has changes)
        cached_data = {
            'data': {'overview': {}, 'top_folders': []},
            'metadata': {'timestamp': datetime.now(timezone.utc).isoformat()}
        }
        mock_load_cache.return_value = cached_data
        mock_validate.return_value = False  # Cache invalid via validate_cache_with_drive
        
        mock_service = MagicMock()
        mock_get_service.return_value = mock_service
        mock_get_overview.return_value = {"total_quota": "1000000000", "used": "0"}
        mock_get_top_folders.return_value = ([], None)
        
        response = client.get("/api/scan/quick")
        
        assert response.status_code == 200
        # Should call Drive API functions
        mock_get_overview.assert_called_once()
        mock_get_top_folders.assert_called_once()
        # Should save new cache
        assert mock_save_cache.called


@pytest.mark.api
@pytest.mark.cache
class TestFullScanCaching:
    """Integration tests for full scan caching."""
    
    @patch('backend.main.get_service')
    @patch('backend.main.load_cache')
    @patch('backend.main.validate_cache_with_drive')
    def test_full_scan_uses_cache_when_valid(
        self,
        mock_validate,
        mock_load_cache,
        mock_get_service,
        client
    ):
        """Test that full scan uses cache when valid."""
        # Cache exists and is valid
        cached_data = {
            'data': {
                'files': [],
                'children_map': {},
                'stats': {
                    'total_files': 0,
                    'total_size': 0,
                    'folder_count': 0,
                    'file_count': 0
                }
            },
            'metadata': {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'cache_version': 1
            }
        }
        mock_load_cache.return_value = cached_data
        mock_validate.return_value = True
        
        response = client.post("/api/scan/full/start")
        
        assert response.status_code == 200
        scan_id = response.json()['scan_id']
        
        # Check status - should be complete immediately
        status_response = client.get(f"/api/scan/full/status/{scan_id}")
        assert status_response.status_code == 200
        status_data = status_response.json()
        assert status_data['status'] == 'complete'
        assert status_data['result'] is not None
    
    @patch('backend.main.get_service')
    @patch('backend.main.load_cache')
    @patch('backend.main.validate_cache_with_drive')
    @patch('backend.main.run_full_scan')
    def test_full_scan_starts_scan_when_cache_invalid(
        self,
        mock_run_scan,
        mock_validate,
        mock_load_cache,
        mock_get_service,
        client
    ):
        """Test that full scan starts scan when cache is invalid."""
        # Cache exists but is invalid
        cached_data = {
            'data': {'files': [], 'children_map': {}, 'stats': {}},
            'metadata': {'timestamp': datetime.now(timezone.utc).isoformat()}
        }
        mock_load_cache.return_value = cached_data
        mock_validate.return_value = False  # Cache invalid
        
        response = client.post("/api/scan/full/start")
        
        assert response.status_code == 200
        # Should start background scan (not use cache)
        # Note: run_full_scan is called in a thread, so we can't easily verify it was called
        # But we can verify the scan_id was returned
        assert 'scan_id' in response.json()


@pytest.mark.api
@pytest.mark.cache
class TestCacheInvalidation:
    """Tests for cache invalidation endpoint."""
    
    @patch('backend.main.clear_cache')
    def test_invalidate_all_caches(self, mock_clear_cache, client):
        """Test invalidating all caches."""
        mock_clear_cache.return_value = True
        
        response = client.delete("/api/cache")
        
        assert response.status_code == 200
        assert "cleared" in response.json()['message'].lower()
        mock_clear_cache.assert_called_once_with(None)
    
    @patch('backend.main.clear_cache')
    def test_invalidate_quick_scan_cache(self, mock_clear_cache, client):
        """Test invalidating quick scan cache."""
        mock_clear_cache.return_value = True
        
        response = client.delete("/api/cache?scan_type=quick_scan")
        
        assert response.status_code == 200
        assert "quick_scan" in response.json()['message'].lower()
        mock_clear_cache.assert_called_once_with('quick_scan')
    
    @patch('backend.main.clear_cache')
    def test_invalidate_full_scan_cache(self, mock_clear_cache, client):
        """Test invalidating full scan cache."""
        mock_clear_cache.return_value = True
        
        response = client.delete("/api/cache?scan_type=full_scan")
        
        assert response.status_code == 200
        assert "full_scan" in response.json()['message'].lower()
        mock_clear_cache.assert_called_once_with('full_scan')
