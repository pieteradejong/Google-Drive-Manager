"""Cache utilities for Drive scan results and derived analytics."""

import json
import time
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Type, TypeVar
from pydantic import BaseModel

from .utils.logger import PerformanceLogger

# Performance logger for cache operations
cache_logger = PerformanceLogger("cache")


class CacheMetadata(BaseModel):
    """Metadata for cached scan results."""

    timestamp: str  # ISO format datetime
    file_count: Optional[int] = None
    total_size: Optional[int] = None
    last_modified: Optional[str] = None  # Most recent file modification time from Drive
    cache_version: int = 1
    validated_count: int = (
        0  # How many times this cache has been validated and confirmed valid
    )


class AnalyticsCacheMetadata(BaseModel):
    """
    Metadata for derived analytics cached from a full_scan cache.

    The analytics cache is only valid if it matches the current full_scan cache metadata.
    """

    # When this analytics cache was computed (ISO datetime)
    computed_at: str

    # Which source cache this was computed from
    source_scan_type: str = "full_scan"
    source_cache_timestamp: str  # CacheMetadata.timestamp (ISO)
    source_cache_version: int = 1
    source_file_count: Optional[int] = None
    source_total_size: Optional[int] = None

    # Version of derived analytics structure (bump on breaking changes)
    derived_version: int = 1

    # Optional: timings for compute steps (ms)
    timings_ms: Dict[str, float] = {}


TMeta = TypeVar("TMeta", bound=BaseModel)


def get_cache_metadata_path(scan_type: str) -> Path:
    """Sidecar metadata path for a cache file (small, fast to read)."""
    cache_dir = get_cache_dir()
    return cache_dir / f"{scan_type}_cache.meta.json"


def load_cache_metadata(scan_type: str, model: Type[TMeta]) -> Optional[TMeta]:
    """Load cache metadata for a given scan_type into a specific Pydantic model."""
    # Fast path: read sidecar metadata file (avoids loading huge cache JSON)
    meta_path = get_cache_metadata_path(scan_type)
    if meta_path.exists():
        try:
            with open(meta_path, "r") as f:
                meta = json.load(f)
            return model(**meta)
        except Exception:
            # Fall through to slow path
            pass

    cache_data = load_cache(scan_type)
    if not cache_data or "metadata" not in cache_data:
        return None
    try:
        return model(**cache_data["metadata"])
    except Exception:
        return None


def get_cache_dir() -> Path:
    """Get the cache directory path."""
    project_root = Path(__file__).parent.parent
    cache_dir = project_root / "cache"
    cache_dir.mkdir(exist_ok=True)
    return cache_dir


def get_cache_path(scan_type: str) -> Path:
    """Get the path to the cache file for a scan type."""
    cache_dir = get_cache_dir()
    return cache_dir / f"{scan_type}_cache.json"


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

    start_time = time.perf_counter()
    try:
        # Get file size for logging
        file_size_mb = (
            cache_path.stat().st_size / (1024 * 1024) if cache_path.exists() else 0
        )

        with open(cache_path, "r") as f:
            cache_data = json.load(f)

        duration_ms = (time.perf_counter() - start_time) * 1000
        cache_logger.info(
            "load_cache",
            duration_ms=duration_ms,
            scan_type=scan_type,
            size_mb=round(file_size_mb, 2),
        )
        return cache_data
    except (json.JSONDecodeError, IOError) as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        cache_logger.error(
            "load_cache",
            duration_ms=duration_ms,
            message=f"Error loading cache: {str(e)}",
            scan_type=scan_type,
        )
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
    start_time = time.perf_counter()

    try:
        cache_data = {"data": data, "metadata": metadata.model_dump()}

        # Write to temporary file first, then rename (atomic operation)
        temp_path = cache_path.with_suffix(".tmp")
        with open(temp_path, "w") as f:
            json.dump(cache_data, f, indent=2)

        temp_path.replace(cache_path)

        # Write metadata sidecar (small, faster reads for status endpoints)
        try:
            meta_path = get_cache_metadata_path(scan_type)
            meta_tmp = meta_path.with_suffix(".tmp")
            with open(meta_tmp, "w") as mf:
                json.dump(metadata.model_dump(), mf, indent=2)
            meta_tmp.replace(meta_path)
        except Exception:
            # Sidecar is best-effort; main cache write succeeded
            pass

        # Get file size after saving
        file_size_mb = (
            cache_path.stat().st_size / (1024 * 1024) if cache_path.exists() else 0
        )
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Best-effort to log a "file_count" field if present
        file_count = None
        try:
            file_count = getattr(metadata, "file_count", None)  # type: ignore[attr-defined]
        except Exception:
            file_count = None

        cache_logger.info(
            "save_cache",
            duration_ms=duration_ms,
            scan_type=scan_type,
            size_mb=round(file_size_mb, 2),
            file_count=file_count,
        )
        return True
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        cache_logger.error(
            "save_cache",
            duration_ms=duration_ms,
            message=f"Error saving cache: {str(e)}",
            scan_type=scan_type,
        )
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
        cache_time = datetime.fromisoformat(metadata.timestamp.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        age_seconds = (now - cache_time).total_seconds()
        return age_seconds < max_age_seconds
    except Exception as e:
        cache_logger.error(
            "is_cache_valid_time_based",
            message=f"Error checking cache validity: {str(e)}",
        )
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
            meta_path = get_cache_metadata_path(scan_type)
            if meta_path.exists():
                meta_path.unlink()
        else:
            # Clear all caches
            cache_dir = get_cache_dir()
            for cache_file in cache_dir.glob("*_cache.json"):
                cache_file.unlink()
            for meta_file in cache_dir.glob("*_cache.meta.json"):
                meta_file.unlink()
        return True
    except Exception as e:
        cache_logger.error(
            "clear_cache",
            message=f"Error clearing cache: {str(e)}",
            scan_type=scan_type or "all",
        )
        return False


def get_cache_metadata(scan_type: str) -> Optional[CacheMetadata]:
    """
    Get metadata from cache file.

    Args:
        scan_type: 'quick_scan' or 'full_scan'

    Returns:
        CacheMetadata if cache exists, None otherwise
    """
    return load_cache_metadata(scan_type, CacheMetadata)


def is_analytics_cache_valid(
    analytics_metadata: AnalyticsCacheMetadata, source_metadata: CacheMetadata
) -> bool:
    """
    Validate derived analytics cache against the current source (full_scan) cache metadata.
    """
    try:
        return (
            analytics_metadata.source_cache_timestamp == source_metadata.timestamp
            and analytics_metadata.source_cache_version == source_metadata.cache_version
            and (
                analytics_metadata.source_file_count is None
                or analytics_metadata.source_file_count == source_metadata.file_count
            )
        )
    except Exception:
        return False


def load_full_scan_analytics_cache() -> Optional[Dict[str, Any]]:
    """Load derived analytics cache if present (raw dict)."""
    return load_cache("full_scan_analytics")


def get_full_scan_analytics_metadata() -> Optional[AnalyticsCacheMetadata]:
    """Get derived analytics cache metadata, if present."""
    return load_cache_metadata("full_scan_analytics", AnalyticsCacheMetadata)


def validate_cache_with_drive(
    service, cache_metadata: CacheMetadata, max_age_seconds: int = 2592000
) -> bool:
    """
    Validate cache by checking if Drive has been modified since cache was created.

    Optimized for drives where files rarely change:
    1. First checks if cache is within TTL (time-based) - default 30 days for rarely-changing drives
    2. If past TTL, checks Drive API for recently modified files (only 1 API call needed)
    3. If no files modified since cache: cache is still valid (extends cache indefinitely)
    4. If files modified: cache is invalid

    Args:
        service: Authenticated Google Drive API service
        cache_metadata: Cache metadata to validate
        max_age_seconds: Maximum age in seconds (default: 30 days) - only used as initial check

    Returns:
        True if cache is valid, False if invalid
    """
    from datetime import datetime, timezone

    # First check: Is cache within TTL? (Fast path - no API call needed)
    # For rarely-changing drives, we use a longer TTL as initial check
    if is_cache_valid_time_based(cache_metadata, max_age_seconds):
        return True

    # Cache is past TTL, but check if Drive actually changed
    # This is the key optimization: only 1 API call to check for changes
    try:
        from .drive_api import check_recently_modified

        cache_time = datetime.fromisoformat(
            cache_metadata.timestamp.replace("Z", "+00:00")
        )

        # Check for files modified since cache was created
        # Limit=1 is enough - we just need to know if ANY file changed
        recently_modified = check_recently_modified(service, cache_time, limit=1)

        if len(recently_modified) == 0:
            # No files modified since cache - cache is still valid!
            # This extends cache validity indefinitely until files actually change
            age_days = (datetime.now(timezone.utc) - cache_time).days
            cache_logger.info(
                "validate_cache_with_drive",
                message=f"Cache past TTL but Drive unchanged - cache still valid (cache age: {age_days} days)",
            )
            return True
        else:
            # Files were modified - cache is invalid
            cache_logger.info(
                "validate_cache_with_drive",
                message=f"Cache invalidated: {len(recently_modified)} file(s) modified since cache",
            )
            return False
    except Exception as e:
        # If Drive API check fails, fall back to time-based validation
        cache_logger.error(
            "validate_cache_with_drive",
            message=f"Error checking Drive for changes: {str(e)}, falling back to time-based validation",
        )
        # For safety, if we can't check Drive, invalidate cache older than max_age_seconds
        return is_cache_valid_time_based(cache_metadata, max_age_seconds)
