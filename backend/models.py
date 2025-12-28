"""Pydantic models for API requests and responses."""

from typing import List, Dict, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field


class ShortcutDetails(BaseModel):
    """Details for shortcut files pointing to other files/folders."""

    targetId: str
    targetMimeType: Optional[str] = None


class FileItem(BaseModel):
    """Model for a single file/folder item."""

    id: str
    name: str
    mimeType: str
    size: Optional[int] = None
    calculatedSize: Optional[int] = Field(None, alias="calculatedSize")
    createdTime: Optional[str] = None
    modifiedTime: Optional[str] = None
    webViewLink: Optional[str] = None
    parents: List[str] = Field(default_factory=list)
    # New fields for duplicate detection
    md5Checksum: Optional[str] = None  # 32-char hex hash for binary files only
    shortcutDetails: Optional[ShortcutDetails] = None  # Only for shortcuts
    ownedByMe: Optional[bool] = None  # Ownership context

    model_config = {"populate_by_name": True}


class DriveStats(BaseModel):
    """Statistics about the Drive."""

    total_files: int
    total_size: int
    folder_count: int
    file_count: int


class ScanResponse(BaseModel):
    """Response model for /api/scan endpoint."""

    files: List[FileItem]
    children_map: Dict[str, List[str]]
    stats: DriveStats

    model_config = {
        "json_schema_extra": {
            "example": {
                "files": [
                    {
                        "id": "123",
                        "name": "My Folder",
                        "mimeType": "application/vnd.google-apps.folder",
                        "calculatedSize": 1024000,
                        "parents": [],
                    }
                ],
                "children_map": {"123": ["456", "789"]},
                "stats": {
                    "total_files": 10,
                    "total_size": 1024000,
                    "folder_count": 2,
                    "file_count": 8,
                },
            }
        }
    }


class HealthResponse(BaseModel):
    """Response model for /api/health endpoint."""

    status: str = "ok"


class QuickScanResponse(BaseModel):
    """Response model for /api/scan/quick endpoint."""

    overview: Dict[str, Any]  # Storage quota, user info from about.get
    top_folders: List[FileItem]  # Root-level folders only
    estimated_total_files: Optional[int] = None  # Estimate from first page if available


class ScanProgress(BaseModel):
    """Progress information for a full scan."""

    scan_id: str
    stage: str  # "fetching", "building_tree", "calculating_sizes", "complete", "error"
    progress: float  # 0-100
    current_page: Optional[int] = None
    estimated_pages: Optional[int] = None
    files_fetched: Optional[int] = None
    message: Optional[str] = None


class FullScanStatusResponse(BaseModel):
    """Response model for /api/scan/full/status/{scan_id}."""

    scan_id: str
    status: str  # "running", "complete", "error"
    progress: ScanProgress
    result: Optional[ScanResponse] = None  # Only present when complete


class FullScanCacheStatusResponse(BaseModel):
    """Status/metadata for the full_scan cache without loading the full payload."""

    exists: bool
    valid: bool
    timestamp: Optional[str] = None
    file_count: Optional[int] = None
    total_size: Optional[int] = None
    cache_version: Optional[int] = None
    reason: Optional[str] = None  # e.g. missing | invalid_or_expired | ok


class AnalyticsStatusResponse(BaseModel):
    """Status for derived analytics computation/cache."""

    status: str  # "missing", "running", "ready", "error"
    message: Optional[str] = None
    source_cache_timestamp: Optional[str] = None
    source_cache_version: Optional[int] = None
    derived_version: Optional[int] = None
    computed_at: Optional[str] = None
    timings_ms: Optional[Dict[str, float]] = None
    error: Optional[str] = None


class AnalyticsViewResponse(BaseModel):
    """Response model for per-view analytics payload."""

    view: str
    source_cache_timestamp: str
    derived_version: int
    computed_at: str
    data: Dict[str, Any]
