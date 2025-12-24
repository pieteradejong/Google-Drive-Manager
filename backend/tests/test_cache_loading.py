"""Tests for cache loading on app startup."""

import pytest
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from backend.cache import (
    CacheMetadata,
    load_cache,
    save_cache,
    is_cache_valid_time_based,
    validate_cache_with_drive,
)
from backend.models import QuickScanResponse, ScanResponse, DriveStats, FileItem


@pytest.mark.integration
@pytest.mark.cache
class TestCacheLoading:
    """Test that cached data loads correctly on app startup."""

    def test_quick_scan_cache_loads_on_startup(self, tmp_path):
        """Test that quick scan cache is available on app startup."""
        with patch("backend.cache.get_cache_dir", return_value=tmp_path):
            # Create a valid cache
            cache_data = {
                "overview": {"used": "1000000", "total_quota": "10000000"},
                "top_folders": [
                    {
                        "id": "folder1",
                        "name": "Test Folder",
                        "mimeType": "application/vnd.google-apps.folder",
                        "parents": [],
                        "size": "1000",
                        "calculatedSize": 1000,
                    }
                ],
                "estimated_total_files": 100,
            }

            metadata = CacheMetadata(
                timestamp=datetime.now(timezone.utc).isoformat(),
                file_count=1,
                total_size=1000,
                cache_version=1,
            )

            save_cache("quick_scan", cache_data, metadata)

            # Load cache
            loaded = load_cache("quick_scan")

            assert loaded is not None
            assert "data" in loaded
            assert "metadata" in loaded
            assert loaded["data"]["estimated_total_files"] == 100

    def test_full_scan_cache_loads_on_startup(self, tmp_path):
        """Test that full scan cache is available on app startup."""
        with patch("backend.cache.get_cache_dir", return_value=tmp_path):
            # Create a valid cache
            cache_data = {
                "files": [
                    {
                        "id": "file1",
                        "name": "Test File",
                        "mimeType": "text/plain",
                        "parents": [],
                        "size": "1000",
                        "calculatedSize": 1000,
                    }
                ],
                "children_map": {},
                "stats": {
                    "total_files": 1,
                    "total_size": 1000,
                    "folder_count": 0,
                    "file_count": 1,
                },
            }

            metadata = CacheMetadata(
                timestamp=datetime.now(timezone.utc).isoformat(),
                file_count=1,
                total_size=1000,
                cache_version=1,
            )

            save_cache("full_scan", cache_data, metadata)

            # Load cache
            loaded = load_cache("full_scan")

            assert loaded is not None
            assert "data" in loaded
            assert "metadata" in loaded
            assert len(loaded["data"]["files"]) == 1

    def test_cache_validity_check(self):
        """Test that cache validity is checked correctly."""
        # Fresh cache (1 minute old)
        fresh_metadata = CacheMetadata(
            timestamp=(datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(),
            cache_version=1,
        )
        assert is_cache_valid_time_based(fresh_metadata, max_age_seconds=3600) is True

        # Expired cache (2 hours old)
        expired_metadata = CacheMetadata(
            timestamp=(datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
            cache_version=1,
        )
        assert (
            is_cache_valid_time_based(expired_metadata, max_age_seconds=3600) is False
        )

    def test_cache_with_drive_validation(self):
        """Test smart cache validation with Drive API."""
        # Mock service
        mock_service = MagicMock()

        # Cache that's past TTL but Drive hasn't changed
        old_metadata = CacheMetadata(
            timestamp=(datetime.now(timezone.utc) - timedelta(days=8)).isoformat(),
            cache_version=1,
        )

        # Patch the function that's imported inside validate_cache_with_drive
        with patch("backend.drive_api.check_recently_modified", return_value=[]):
            # Drive hasn't changed, so cache is still valid
            result = validate_cache_with_drive(
                mock_service, old_metadata, max_age_seconds=604800
            )
            assert result is True

        # Cache that's past TTL and Drive has changed
        with patch(
            "backend.drive_api.check_recently_modified",
            return_value=[{"id": "file1", "name": "New File"}],
        ):
            # Drive has changed, so cache is invalid
            result = validate_cache_with_drive(
                mock_service, old_metadata, max_age_seconds=604800
            )
            assert result is False
