"""Pydantic models for API requests and responses."""
from typing import List, Dict, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field


class FileItem(BaseModel):
    """Model for a single file/folder item."""
    id: str
    name: str
    mimeType: str
    size: Optional[int] = None
    calculatedSize: Optional[int] = Field(None, alias='calculatedSize')
    createdTime: Optional[str] = None
    modifiedTime: Optional[str] = None
    webViewLink: Optional[str] = None
    parents: List[str] = Field(default_factory=list)
    
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
                        "parents": []
                    }
                ],
                "children_map": {
                    "123": ["456", "789"]
                },
                "stats": {
                    "total_files": 10,
                    "total_size": 1024000,
                    "folder_count": 2,
                    "file_count": 8
                }
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

