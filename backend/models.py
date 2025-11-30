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

