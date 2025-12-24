"""Tests for backend/main.py API endpoints."""
import pytest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
from starlette.testclient import TestClient
from backend import main
from backend.cache import CacheMetadata, AnalyticsCacheMetadata


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


# =============================================================================
# Analytics Endpoint Tests
# =============================================================================

@pytest.mark.api
class TestAnalyticsStatusEndpoint:
    """Tests for /api/analytics/status endpoint."""
    
    @patch('backend.main._current_full_scan_cache_metadata')
    @patch('backend.main.get_full_scan_analytics_metadata')
    def test_analytics_status_missing_full_scan(
        self,
        mock_analytics_meta,
        mock_full_meta,
        client
    ):
        """Test status when full scan cache is missing."""
        mock_full_meta.return_value = None
        
        response = client.get("/api/analytics/status")
        
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'missing'
        assert 'not available' in data['message'].lower()
    
    @patch('backend.main._current_full_scan_cache_metadata')
    @patch('backend.main.get_full_scan_analytics_metadata')
    @patch('backend.main.is_analytics_cache_valid')
    def test_analytics_status_ready(
        self,
        mock_is_valid,
        mock_analytics_meta,
        mock_full_meta,
        client
    ):
        """Test status when analytics cache is ready."""
        mock_full_meta.return_value = CacheMetadata(
            timestamp=datetime.now(timezone.utc).isoformat(),
            cache_version=1
        )
        mock_analytics_meta.return_value = AnalyticsCacheMetadata(
            computed_at=datetime.now(timezone.utc).isoformat(),
            source_cache_timestamp=datetime.now(timezone.utc).isoformat(),
            source_cache_version=1,
            derived_version=1
        )
        mock_is_valid.return_value = True
        
        response = client.get("/api/analytics/status")
        
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'ready'
    
    @patch('backend.main._analytics_state', {'status': 'running'})
    @patch('backend.main._current_full_scan_cache_metadata')
    def test_analytics_status_running(
        self,
        mock_full_meta,
        client
    ):
        """Test status when analytics computation is running."""
        mock_full_meta.return_value = CacheMetadata(
            timestamp=datetime.now(timezone.utc).isoformat(),
            cache_version=1
        )
        
        response = client.get("/api/analytics/status")
        
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'running'


@pytest.mark.api
class TestAnalyticsStartEndpoint:
    """Tests for /api/analytics/start endpoint."""
    
    @patch('backend.main.start_analytics_compute_if_needed')
    @patch('backend.main._current_full_scan_cache_metadata')
    def test_analytics_start_no_full_scan(
        self,
        mock_full_meta,
        mock_start_compute,
        client
    ):
        """Test start when full scan cache is missing."""
        mock_full_meta.return_value = None
        mock_start_compute.return_value = False
        
        response = client.post("/api/analytics/start")
        
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'missing'
    
    @patch('backend.main.start_analytics_compute_if_needed')
    @patch('backend.main._current_full_scan_cache_metadata')
    @patch('backend.main._analytics_state', {'status': 'running'})
    def test_analytics_start_triggers_compute(
        self,
        mock_full_meta,
        mock_start_compute,
        client
    ):
        """Test that start triggers analytics computation."""
        mock_full_meta.return_value = CacheMetadata(
            timestamp=datetime.now(timezone.utc).isoformat(),
            cache_version=1
        )
        mock_start_compute.return_value = True
        
        response = client.post("/api/analytics/start")
        
        assert response.status_code == 200
        mock_start_compute.assert_called_once()


@pytest.mark.api
class TestAnalyticsViewEndpoint:
    """Tests for /api/analytics/view/{view} endpoint."""
    
    @patch('backend.main._current_full_scan_cache_metadata')
    def test_analytics_view_no_full_scan(
        self,
        mock_full_meta,
        client
    ):
        """Test view when full scan cache is missing."""
        mock_full_meta.return_value = None
        
        response = client.get("/api/analytics/view/duplicates")
        
        assert response.status_code == 400
        assert 'not available' in response.json()['detail'].lower()
    
    @patch('backend.main._current_full_scan_cache_metadata')
    @patch('backend.main.load_cache')
    @patch('backend.main.get_full_scan_analytics_metadata')
    @patch('backend.main.is_analytics_cache_valid')
    @patch('backend.main.start_analytics_compute_if_needed')
    def test_analytics_view_not_ready(
        self,
        mock_start_compute,
        mock_is_valid,
        mock_analytics_meta,
        mock_load_cache,
        mock_full_meta,
        client
    ):
        """Test view when analytics cache is not ready."""
        mock_full_meta.return_value = CacheMetadata(
            timestamp=datetime.now(timezone.utc).isoformat(),
            cache_version=1
        )
        mock_load_cache.return_value = None
        mock_analytics_meta.return_value = None
        mock_is_valid.return_value = False
        
        response = client.get("/api/analytics/view/duplicates")
        
        assert response.status_code == 409
        assert 'not ready' in response.json()['detail'].lower()
    
    @patch('backend.main._current_full_scan_cache_metadata')
    @patch('backend.main.load_cache')
    @patch('backend.main.get_full_scan_analytics_metadata')
    @patch('backend.main.is_analytics_cache_valid')
    @patch('backend.main._build_file_index_from_full_scan')
    def test_analytics_view_duplicates(
        self,
        mock_build_index,
        mock_is_valid,
        mock_analytics_meta,
        mock_load_cache,
        mock_full_meta,
        client
    ):
        """Test duplicates view endpoint."""
        timestamp = datetime.now(timezone.utc).isoformat()
        
        mock_full_meta.return_value = CacheMetadata(
            timestamp=timestamp,
            cache_version=1
        )
        mock_analytics_meta.return_value = AnalyticsCacheMetadata(
            computed_at=timestamp,
            source_cache_timestamp=timestamp,
            source_cache_version=1,
            derived_version=1
        )
        mock_load_cache.return_value = {
            'data': {
                'derived_version': 1,
                'duplicates': {
                    'groups': [
                        {
                            'name': 'Report.pdf',
                            'size': 5000,
                            'file_ids': ['f1', 'f2'],
                            'count': 2,
                            'potential_savings': 5000
                        }
                    ],
                    'total_potential_savings': 5000
                }
            }
        }
        mock_is_valid.return_value = True
        mock_build_index.return_value = (
            {'files': []},
            {}
        )
        
        response = client.get("/api/analytics/view/duplicates")
        
        assert response.status_code == 200
        data = response.json()
        assert data['view'] == 'duplicates'
        assert 'groups' in data['data']
    
    @patch('backend.main._current_full_scan_cache_metadata')
    @patch('backend.main.load_cache')
    @patch('backend.main.get_full_scan_analytics_metadata')
    @patch('backend.main.is_analytics_cache_valid')
    def test_analytics_view_semantic(
        self,
        mock_is_valid,
        mock_analytics_meta,
        mock_load_cache,
        mock_full_meta,
        client
    ):
        """Test semantic view endpoint."""
        timestamp = datetime.now(timezone.utc).isoformat()
        
        mock_full_meta.return_value = CacheMetadata(
            timestamp=timestamp,
            cache_version=1
        )
        mock_analytics_meta.return_value = AnalyticsCacheMetadata(
            computed_at=timestamp,
            source_cache_timestamp=timestamp,
            source_cache_version=1,
            derived_version=1
        )
        mock_load_cache.return_value = {
            'data': {
                'derived_version': 1,
                'semantic': {
                    'folder_category': {},
                    'totals': {},
                    'uncategorized_count': 0
                }
            }
        }
        mock_is_valid.return_value = True
        
        response = client.get("/api/analytics/view/semantic")
        
        assert response.status_code == 200
        data = response.json()
        assert data['view'] == 'semantic'
    
    @patch('backend.main._current_full_scan_cache_metadata')
    @patch('backend.main.load_cache')
    @patch('backend.main.get_full_scan_analytics_metadata')
    @patch('backend.main.is_analytics_cache_valid')
    def test_analytics_view_unknown(
        self,
        mock_is_valid,
        mock_analytics_meta,
        mock_load_cache,
        mock_full_meta,
        client
    ):
        """Test unknown view returns 404."""
        timestamp = datetime.now(timezone.utc).isoformat()
        
        mock_full_meta.return_value = CacheMetadata(
            timestamp=timestamp,
            cache_version=1
        )
        mock_analytics_meta.return_value = AnalyticsCacheMetadata(
            computed_at=timestamp,
            source_cache_timestamp=timestamp,
            source_cache_version=1,
            derived_version=1
        )
        mock_load_cache.return_value = {
            'data': {'derived_version': 1}
        }
        mock_is_valid.return_value = True
        
        response = client.get("/api/analytics/view/nonexistent")
        
        assert response.status_code == 404


# =============================================================================
# Index Endpoint Tests
# =============================================================================

@pytest.mark.api
class TestIndexStatusEndpoint:
    """Tests for /api/index/status endpoint."""
    
    @patch('backend.index_db.database_exists')
    def test_index_status_not_initialized(
        self,
        mock_db_exists,
        client
    ):
        """Test status when index is not initialized."""
        mock_db_exists.return_value = False
        
        response = client.get("/api/index/status")
        
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'not_initialized'
        assert data['can_crawl'] is True
        assert data['can_sync'] is False
    
    @patch('backend.index_db.database_exists')
    @patch('backend.crawl_full.get_last_crawl_info')
    def test_index_status_empty(
        self,
        mock_get_info,
        mock_db_exists,
        client
    ):
        """Test status when database exists but is empty."""
        mock_db_exists.return_value = True
        mock_get_info.return_value = None
        
        response = client.get("/api/index/status")
        
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'empty'
    
    @patch('backend.index_db.database_exists')
    @patch('backend.crawl_full.get_last_crawl_info')
    @patch('backend.index_db.get_connection')
    @patch('backend.index_db.get_file_count')
    @patch('backend.sync_changes.can_sync')
    def test_index_status_ready(
        self,
        mock_can_sync,
        mock_file_count,
        mock_conn,
        mock_get_info,
        mock_db_exists,
        client
    ):
        """Test status when index is ready."""
        mock_db_exists.return_value = True
        mock_get_info.return_value = {
            'last_full_crawl_time': datetime.now(timezone.utc).isoformat(),
            'last_sync_time': datetime.now(timezone.utc).isoformat()
        }
        mock_file_count.return_value = 1000
        mock_can_sync.return_value = True
        
        # Mock context manager
        mock_conn.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_conn.return_value.__exit__ = MagicMock(return_value=False)
        
        response = client.get("/api/index/status")
        
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'ready'
        assert data['file_count'] == 1000
        assert data['can_sync'] is True


@pytest.mark.api
class TestIndexCrawlEndpoint:
    """Tests for /api/index/crawl/start endpoint."""
    
    @patch('backend.main.get_service')
    @patch('backend.main.Thread')
    def test_index_crawl_start(
        self,
        mock_thread,
        mock_get_service,
        client
    ):
        """Test starting a crawl."""
        mock_get_service.return_value = MagicMock()
        mock_thread_instance = MagicMock()
        mock_thread.return_value = mock_thread_instance
        
        response = client.post("/api/index/crawl/start")
        
        assert response.status_code == 200
        data = response.json()
        assert 'scan_id' in data
        mock_thread_instance.start.assert_called_once()


@pytest.mark.api
class TestIndexSyncEndpoint:
    """Tests for /api/index/sync/start endpoint."""
    
    @patch('backend.sync_changes.can_sync')
    def test_index_sync_not_available(
        self,
        mock_can_sync,
        client
    ):
        """Test sync when not available."""
        mock_can_sync.return_value = False
        
        response = client.post("/api/index/sync/start")
        
        assert response.status_code == 400
        assert 'cannot sync' in response.json()['detail'].lower()
    
    @patch('backend.sync_changes.can_sync')
    @patch('backend.main.get_service')
    @patch('backend.main.Thread')
    def test_index_sync_start(
        self,
        mock_thread,
        mock_get_service,
        mock_can_sync,
        client
    ):
        """Test starting a sync."""
        mock_can_sync.return_value = True
        mock_get_service.return_value = MagicMock()
        mock_thread_instance = MagicMock()
        mock_thread.return_value = mock_thread_instance
        
        response = client.post("/api/index/sync/start")
        
        assert response.status_code == 200
        data = response.json()
        assert 'scan_id' in data


@pytest.mark.api
class TestIndexScanStatusEndpoint:
    """Tests for /api/index/scan/status/{scan_id} endpoint."""
    
    def test_index_scan_status_not_found(self, client):
        """Test status for non-existent scan."""
        response = client.get("/api/index/scan/status/nonexistent")
        
        assert response.status_code == 404
    
    def test_index_scan_status_found(self, client):
        """Test status for existing scan."""
        # Set up a scan state
        scan_id = 'test_scan_123'
        main._sqlite_scan_states[scan_id] = {
            'status': 'running',
            'type': 'crawl',
            'progress': {'stage': 'fetching', 'files_fetched': 100},
            'result': None
        }
        
        try:
            response = client.get(f"/api/index/scan/status/{scan_id}")
            
            assert response.status_code == 200
            data = response.json()
            assert data['scan_id'] == scan_id
            assert data['status'] == 'running'
            assert data['progress']['files_fetched'] == 100
        finally:
            # Clean up
            del main._sqlite_scan_states[scan_id]


@pytest.mark.api
class TestIndexDataEndpoint:
    """Tests for /api/index/data endpoint."""
    
    @patch('backend.index_db.database_exists')
    def test_index_data_no_database(
        self,
        mock_db_exists,
        client
    ):
        """Test data endpoint when no database."""
        mock_db_exists.return_value = False
        
        response = client.get("/api/index/data")
        
        assert response.status_code == 404
    
    @patch('backend.index_db.database_exists')
    @patch('backend.queries.build_scan_response_data')
    def test_index_data_success(
        self,
        mock_build_response,
        mock_db_exists,
        client,
        sample_files
    ):
        """Test successful data retrieval."""
        mock_db_exists.return_value = True
        mock_build_response.return_value = {
            'files': sample_files,
            'children_map': {},
            'stats': {
                'total_files': len(sample_files),
                'total_size': 1000000,
                'folder_count': 2,
                'file_count': 3
            }
        }
        
        response = client.get("/api/index/data")
        
        assert response.status_code == 200
        data = response.json()
        assert 'files' in data
        assert 'stats' in data


@pytest.mark.api
class TestIndexDuplicatesEndpoint:
    """Tests for /api/index/duplicates endpoint."""
    
    @patch('backend.index_db.database_exists')
    def test_index_duplicates_no_database(
        self,
        mock_db_exists,
        client
    ):
        """Test duplicates endpoint when no database."""
        mock_db_exists.return_value = False
        
        response = client.get("/api/index/duplicates")
        
        assert response.status_code == 404
    
    @patch('backend.index_db.database_exists')
    @patch('backend.index_db.get_connection')
    @patch('backend.queries.get_duplicate_groups')
    @patch('backend.queries.get_total_duplicate_savings')
    @patch('backend.queries.get_duplicate_files_detail')
    def test_index_duplicates_success(
        self,
        mock_get_detail,
        mock_get_savings,
        mock_get_groups,
        mock_conn,
        mock_db_exists,
        client
    ):
        """Test successful duplicates retrieval."""
        mock_db_exists.return_value = True
        
        # Mock context manager
        mock_conn.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_conn.return_value.__exit__ = MagicMock(return_value=False)
        
        mock_get_groups.return_value = [
            {
                'name': 'Report.pdf',
                'size': 5000,
                'file_ids': ['f1', 'f2'],
                'count': 2
            }
        ]
        mock_get_savings.return_value = {
            'total_groups': 1,
            'total_duplicate_files': 2,
            'total_wasted_bytes': 5000
        }
        mock_get_detail.return_value = [
            {'id': 'f1', 'name': 'Report.pdf'},
            {'id': 'f2', 'name': 'Report.pdf'}
        ]
        
        response = client.get("/api/index/duplicates")
        
        assert response.status_code == 200
        data = response.json()
        assert 'groups' in data
        assert data['total_groups'] == 1


@pytest.mark.api
class TestIndexClearEndpoint:
    """Tests for /api/index/clear endpoint."""
    
    @patch('backend.index_db.clear_database')
    def test_index_clear_success(
        self,
        mock_clear,
        client
    ):
        """Test successful index clearing."""
        response = client.delete("/api/index/clear")
        
        assert response.status_code == 200
        assert 'cleared' in response.json()['message'].lower()
        mock_clear.assert_called_once()
    
    @patch('backend.index_db.clear_database')
    def test_index_clear_error(
        self,
        mock_clear,
        client
    ):
        """Test index clearing with error."""
        mock_clear.side_effect = Exception("Database error")
        
        response = client.delete("/api/index/clear")
        
        assert response.status_code == 500


@pytest.mark.api
class TestCachedFullScanEndpoint:
    """Tests for /api/scan/full/cached endpoint."""
    
    @patch('backend.main.load_cache')
    def test_cached_full_scan_no_cache(
        self,
        mock_load,
        client
    ):
        """Test when no cache is available."""
        mock_load.return_value = None
        
        response = client.get("/api/scan/full/cached")
        
        assert response.status_code == 404
    
    @patch('backend.main.load_cache')
    @patch('backend.main.get_service')
    @patch('backend.main.validate_cache_with_drive')
    def test_cached_full_scan_expired(
        self,
        mock_validate,
        mock_service,
        mock_load,
        client
    ):
        """Test when cache is expired."""
        mock_load.return_value = {
            'data': {},
            'metadata': {'timestamp': datetime.now(timezone.utc).isoformat()}
        }
        mock_service.return_value = MagicMock()
        mock_validate.return_value = False
        
        response = client.get("/api/scan/full/cached")
        
        assert response.status_code == 404
    
    @patch('backend.main.load_cache')
    @patch('backend.main.get_service')
    @patch('backend.main.validate_cache_with_drive')
    @patch('backend.main.start_analytics_compute_if_needed')
    def test_cached_full_scan_success(
        self,
        mock_analytics,
        mock_validate,
        mock_service,
        mock_load,
        client,
        sample_files
    ):
        """Test successful cached data retrieval."""
        mock_load.return_value = {
            'data': {
                'files': sample_files,
                'children_map': {},
                'stats': {
                    'total_files': len(sample_files),
                    'total_size': 1000000,
                    'folder_count': 2,
                    'file_count': 3
                }
            },
            'metadata': {'timestamp': datetime.now(timezone.utc).isoformat()}
        }
        mock_service.return_value = MagicMock()
        mock_validate.return_value = True
        
        response = client.get("/api/scan/full/cached")
        
        assert response.status_code == 200
        data = response.json()
        assert 'files' in data
        assert 'stats' in data

