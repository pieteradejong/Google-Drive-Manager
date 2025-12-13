"""Tests for backend/cache.py cache utilities."""
import pytest
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock, mock_open

from backend.cache import (
    CacheMetadata,
    get_cache_dir,
    get_cache_path,
    load_cache,
    save_cache,
    is_cache_valid_time_based,
    clear_cache,
    get_cache_metadata,
    validate_cache_with_drive
)


@pytest.mark.unit
@pytest.mark.cache
class TestCacheMetadata:
    """Tests for CacheMetadata model."""
    
    def test_cache_metadata_creation(self):
        """Test creating CacheMetadata."""
        metadata = CacheMetadata(
            timestamp="2024-01-15T10:30:00Z",
            file_count=100,
            total_size=1024000,
            cache_version=1
        )
        
        assert metadata.timestamp == "2024-01-15T10:30:00Z"
        assert metadata.file_count == 100
        assert metadata.total_size == 1024000
        assert metadata.cache_version == 1
    
    def test_cache_metadata_optional_fields(self):
        """Test CacheMetadata with optional fields."""
        metadata = CacheMetadata(timestamp="2024-01-15T10:30:00Z")
        
        assert metadata.file_count is None
        assert metadata.total_size is None
        assert metadata.last_modified is None


@pytest.mark.unit
@pytest.mark.cache
class TestCachePaths:
    """Tests for cache path functions."""
    
    def test_get_cache_dir(self):
        """Test getting cache directory."""
        cache_dir = get_cache_dir()
        assert isinstance(cache_dir, Path)
        assert cache_dir.name == 'cache'
    
    def test_get_cache_path(self):
        """Test getting cache file path."""
        path = get_cache_path('quick_scan')
        assert isinstance(path, Path)
        assert path.name == 'quick_scan_cache.json'
        
        path2 = get_cache_path('full_scan')
        assert path2.name == 'full_scan_cache.json'


@pytest.mark.unit
@pytest.mark.cache
class TestCacheOperations:
    """Tests for cache load/save operations."""
    
    @patch('backend.cache.get_cache_path')
    @patch('pathlib.Path.exists')
    @patch('builtins.open', new_callable=mock_open, read_data='{"data": {"test": "value"}, "metadata": {"timestamp": "2024-01-15T10:30:00Z", "cache_version": 1}}')
    def test_load_cache_success(self, mock_file, mock_exists, mock_get_path):
        """Test loading cache successfully."""
        mock_exists.return_value = True
        mock_get_path.return_value = Path('test_cache.json')
        
        cache_data = load_cache('quick_scan')
        
        assert cache_data is not None
        assert cache_data['data']['test'] == 'value'
        assert cache_data['metadata']['timestamp'] == '2024-01-15T10:30:00Z'
    
    @patch('backend.cache.get_cache_path')
    @patch('pathlib.Path.exists')
    def test_load_cache_not_found(self, mock_exists, mock_get_path):
        """Test loading cache when file doesn't exist."""
        mock_exists.return_value = False
        mock_get_path.return_value = Path('test_cache.json')
        
        cache_data = load_cache('quick_scan')
        
        assert cache_data is None
    
    @patch('backend.cache.get_cache_path')
    @patch('pathlib.Path.exists')
    @patch('builtins.open', new_callable=mock_open, read_data='invalid json')
    def test_load_cache_corrupted(self, mock_file, mock_exists, mock_get_path):
        """Test loading corrupted cache file."""
        mock_exists.return_value = True
        mock_get_path.return_value = Path('test_cache.json')
        
        cache_data = load_cache('quick_scan')
        
        assert cache_data is None
    
    @patch('backend.cache.get_cache_path')
    @patch('builtins.open', new_callable=mock_open)
    @patch('pathlib.Path.replace')
    def test_save_cache_success(self, mock_replace, mock_file, mock_get_path):
        """Test saving cache successfully."""
        cache_path = Path('test_cache.json')
        temp_path = Path('test_cache.tmp')
        mock_cache_path = MagicMock()
        mock_cache_path.with_suffix.return_value = temp_path
        mock_get_path.return_value = mock_cache_path
        
        metadata = CacheMetadata(
            timestamp=datetime.now(timezone.utc).isoformat(),
            file_count=100,
            cache_version=1
        )
        data = {"test": "data"}
        
        result = save_cache('quick_scan', data, metadata)
        
        assert result is True
        mock_file.assert_called()
    
    @patch('backend.cache.get_cache_path')
    @patch('builtins.open', side_effect=IOError("Permission denied"))
    def test_save_cache_error(self, mock_file, mock_get_path):
        """Test saving cache with error."""
        mock_get_path.return_value = Path('test_cache.json')
        
        metadata = CacheMetadata(timestamp=datetime.now(timezone.utc).isoformat())
        result = save_cache('quick_scan', {}, metadata)
        
        assert result is False


@pytest.mark.unit
@pytest.mark.cache
class TestCacheValidation:
    """Tests for cache validation."""
    
    def test_is_cache_valid_time_based_valid(self):
        """Test cache is valid when within TTL."""
        now = datetime.now(timezone.utc)
        metadata = CacheMetadata(timestamp=now.isoformat())
        
        # Cache is 30 minutes old, TTL is 1 hour
        result = is_cache_valid_time_based(metadata, max_age_seconds=3600)
        
        assert result is True
    
    def test_is_cache_valid_time_based_expired(self):
        """Test cache is expired when past TTL."""
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        metadata = CacheMetadata(timestamp=past.isoformat())
        
        # Cache is 2 hours old, TTL is 1 hour
        result = is_cache_valid_time_based(metadata, max_age_seconds=3600)
        
        assert result is False
    
    @patch('backend.drive_api.check_recently_modified')
    def test_validate_cache_with_drive_within_ttl(self, mock_check_recently):
        """Test cache validation when within TTL."""
        now = datetime.now(timezone.utc)
        metadata = CacheMetadata(timestamp=now.isoformat())
        mock_service = MagicMock()
        
        result = validate_cache_with_drive(mock_service, metadata, max_age_seconds=3600)
        
        assert result is True
        # Should not check Drive API if within TTL
        mock_check_recently.assert_not_called()
    
    @patch('backend.drive_api.check_recently_modified')
    def test_validate_cache_with_drive_no_changes(self, mock_check_recently):
        """Test cache validation when past TTL but Drive unchanged."""
        past = datetime.now(timezone.utc) - timedelta(days=8)
        metadata = CacheMetadata(timestamp=past.isoformat())
        mock_service = MagicMock()
        mock_check_recently.return_value = []  # No files modified
        
        result = validate_cache_with_drive(mock_service, metadata, max_age_seconds=604800)
        
        assert result is True
        mock_check_recently.assert_called_once()
    
    @patch('backend.drive_api.check_recently_modified')
    def test_validate_cache_with_drive_has_changes(self, mock_check_recently):
        """Test cache validation when Drive has changes."""
        past = datetime.now(timezone.utc) - timedelta(days=8)
        metadata = CacheMetadata(timestamp=past.isoformat())
        mock_service = MagicMock()
        mock_check_recently.return_value = [{'id': '123', 'name': 'modified.txt'}]  # Files modified
        
        result = validate_cache_with_drive(mock_service, metadata, max_age_seconds=604800)
        
        assert result is False
        mock_check_recently.assert_called_once()
    
    @patch('backend.drive_api.check_recently_modified')
    def test_validate_cache_with_drive_api_error(self, mock_check_recently):
        """Test cache validation falls back on API error."""
        past = datetime.now(timezone.utc) - timedelta(days=8)
        metadata = CacheMetadata(timestamp=past.isoformat())
        mock_service = MagicMock()
        mock_check_recently.side_effect = Exception("API Error")
        
        result = validate_cache_with_drive(mock_service, metadata, max_age_seconds=604800)
        
        # Should return False (invalid) when API check fails
        assert result is False


@pytest.mark.unit
@pytest.mark.cache
class TestCacheManagement:
    """Tests for cache management functions."""
    
    @patch('backend.cache.get_cache_path')
    @patch('pathlib.Path.exists')
    @patch('pathlib.Path.unlink')
    def test_clear_cache_specific(self, mock_unlink, mock_exists, mock_get_path):
        """Test clearing specific cache."""
        mock_exists.return_value = True
        mock_get_path.return_value = Path('test_cache.json')
        
        result = clear_cache('quick_scan')
        
        assert result is True
        mock_unlink.assert_called_once()
    
    @patch('backend.cache.get_cache_dir')
    def test_clear_cache_all(self, mock_get_dir):
        """Test clearing all caches."""
        mock_dir = MagicMock()
        mock_cache_file = MagicMock()
        mock_dir.glob.return_value = [mock_cache_file]
        mock_get_dir.return_value = mock_dir
        
        result = clear_cache()
        
        assert result is True
        mock_cache_file.unlink.assert_called_once()
    
    @patch('backend.cache.load_cache')
    def test_get_cache_metadata_success(self, mock_load_cache):
        """Test getting cache metadata."""
        mock_load_cache.return_value = {
            'metadata': {
                'timestamp': '2024-01-15T10:30:00Z',
                'file_count': 100,
                'cache_version': 1
            }
        }
        
        metadata = get_cache_metadata('quick_scan')
        
        assert metadata is not None
        assert metadata.timestamp == '2024-01-15T10:30:00Z'
        assert metadata.file_count == 100
    
    @patch('backend.cache.load_cache')
    def test_get_cache_metadata_not_found(self, mock_load_cache):
        """Test getting metadata when cache doesn't exist."""
        mock_load_cache.return_value = None
        
        metadata = get_cache_metadata('quick_scan')
        
        assert metadata is None
