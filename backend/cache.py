"""Cache utilities for Drive scan results."""
import json
import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from pydantic import BaseModel

from .models import QuickScanResponse, ScanResponse


class CacheMetadata(BaseModel):
    """Metadata for cached scan results."""
    timestamp: str  # ISO format datetime
    file_count: Optional[int] = None
    total_size: Optional[int] = None
    last_modified: Optional[str] = None  # Most recent file modification time from Drive
    cache_version: int = 1


def get_cache_dir() -> Path:
    """Get the cache directory path."""
    project_root = Path(__file__).parent.parent
    cache_dir = project_root / 'cache'
    cache_dir.mkdir(exist_ok=True)
    return cache_dir


def get_cache_path(scan_type: str) -> Path:
    """Get the path to the cache file for a scan type."""
    cache_dir = get_cache_dir()
    return cache_dir / f'{scan_type}_cache.json'


def load_cache(scan_type: str) -> Optional[Dict[str, Any]]:
    """
    Load cached data if it exists and is valid.
    
    Args:
        scan_type: 'quick_scan' or 'full_scan'
        
    Returns:
        Dictionary with 'data' and 'metadata' keys, or None if cache doesn't exist
    """
    cache_path = get_cache_path(scan_type)
    
    if not cache_path.exists():
        return None
    
    try:
        with open(cache_path, 'r') as f:
            cache_data = json.load(f)
        return cache_data
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error loading cache: {e}")
        # If cache is corrupted, delete it
        try:
            cache_path.unlink()
        except:
            pass
        return None


def save_cache(scan_type: str, data: Any, metadata: CacheMetadata) -> bool:
    """
    Save data to cache file.
    
    Args:
        scan_type: 'quick_scan' or 'full_scan'
        data: The scan result data to cache
        metadata: Cache metadata
        
    Returns:
        True if successful, False otherwise
    """
    cache_path = get_cache_path(scan_type)
    
    try:
        cache_data = {
            'data': data,
            'metadata': metadata.model_dump()
        }
        
        # Write to temporary file first, then rename (atomic operation)
        temp_path = cache_path.with_suffix('.tmp')
        with open(temp_path, 'w') as f:
            json.dump(cache_data, f, indent=2)
        
        temp_path.replace(cache_path)
        return True
    except Exception as e:
        print(f"Error saving cache: {e}")
        return False


def is_cache_valid_time_based(metadata: CacheMetadata, max_age_seconds: int) -> bool:
    """
    Check if cache is valid based on time only.
    
    Args:
        metadata: Cache metadata
        max_age_seconds: Maximum age in seconds
        
    Returns:
        True if cache is still valid, False otherwise
    """
    try:
        cache_time = datetime.fromisoformat(metadata.timestamp.replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        age_seconds = (now - cache_time).total_seconds()
        return age_seconds < max_age_seconds
    except Exception as e:
        print(f"Error checking cache validity: {e}")
        return False


def clear_cache(scan_type: Optional[str] = None) -> bool:
    """
    Clear cache file(s).
    
    Args:
        scan_type: 'quick_scan', 'full_scan', or None to clear all
        
    Returns:
        True if successful
    """
    try:
        if scan_type:
            cache_path = get_cache_path(scan_type)
            if cache_path.exists():
                cache_path.unlink()
        else:
            # Clear all caches
            cache_dir = get_cache_dir()
            for cache_file in cache_dir.glob('*_cache.json'):
                cache_file.unlink()
        return True
    except Exception as e:
        print(f"Error clearing cache: {e}")
        return False


def get_cache_metadata(scan_type: str) -> Optional[CacheMetadata]:
    """
    Get metadata from cache file.
    
    Args:
        scan_type: 'quick_scan' or 'full_scan'
        
    Returns:
        CacheMetadata if cache exists, None otherwise
    """
    cache_data = load_cache(scan_type)
    if not cache_data or 'metadata' not in cache_data:
        return None
    
    try:
        return CacheMetadata(**cache_data['metadata'])
    except Exception:
        return None


def validate_cache_with_drive(service, cache_metadata: CacheMetadata, max_age_seconds: int = 604800) -> bool:
    """
    Validate cache by checking if Drive has been modified since cache was created.
    
    This is a smart validation that:
    1. First checks if cache is within TTL (time-based)
    2. If past TTL, checks Drive API for recently modified files
    3. If no files modified since cache: cache is still valid
    4. If files modified: cache is invalid
    
    Args:
        service: Authenticated Google Drive API service
        cache_metadata: Cache metadata to validate
        max_age_seconds: Maximum age in seconds (default: 7 days)
        
    Returns:
        True if cache is valid, False if invalid
    """
    from datetime import datetime, timezone
    
    # First check: Is cache within TTL?
    if is_cache_valid_time_based(cache_metadata, max_age_seconds):
        return True
    
    # Cache is past TTL, but check if Drive actually changed
    try:
        from .drive_api import check_recently_modified
        cache_time = datetime.fromisoformat(cache_metadata.timestamp.replace('Z', '+00:00'))
        # Check for files modified since cache was created
        recently_modified = check_recently_modified(service, cache_time, limit=10)
        
        if len(recently_modified) == 0:
            # No files modified since cache - cache is still valid!
            print(f"Cache past TTL but Drive unchanged - cache still valid")
            return True
        else:
            # Files were modified - cache is invalid
            print(f"Cache invalidated: {len(recently_modified)} files modified since cache")
            return False
    except Exception as e:
        # If Drive API check fails, fall back to time-based validation
        print(f"Error checking Drive for changes: {e}, falling back to time-based validation")
        return False
