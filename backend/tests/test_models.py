"""Tests for backend/models.py."""
import pytest
from backend.models import (
    FileItem,
    DriveStats,
    ScanResponse,
    HealthResponse
)


@pytest.mark.unit
class TestFileItem:
    """Tests for FileItem model."""
    
    def test_file_item_creation(self):
        """Test creating a FileItem with all fields."""
        file_item = FileItem(
            id="test_id",
            name="test_file.txt",
            mimeType="text/plain",
            size=1024,
            createdTime="2024-01-01T00:00:00Z",
            modifiedTime="2024-01-01T00:00:00Z",
            webViewLink="https://drive.google.com/file/d/test_id/view",
            parents=[]
        )
        
        assert file_item.id == "test_id"
        assert file_item.name == "test_file.txt"
        assert file_item.mimeType == "text/plain"
        assert file_item.size == 1024
        assert file_item.parents == []
    
    def test_file_item_with_calculated_size(self):
        """Test FileItem with calculatedSize (for folders)."""
        folder_item = FileItem(
            id="folder_id",
            name="My Folder",
            mimeType="application/vnd.google-apps.folder",
            calculatedSize=2048,
            parents=[]
        )
        
        assert folder_item.calculatedSize == 2048
        assert folder_item.mimeType == "application/vnd.google-apps.folder"
    
    def test_file_item_minimal(self):
        """Test FileItem with only required fields."""
        file_item = FileItem(
            id="minimal_id",
            name="minimal.txt",
            mimeType="text/plain"
        )
        
        assert file_item.id == "minimal_id"
        assert file_item.size is None
        assert file_item.parents == []


@pytest.mark.unit
class TestDriveStats:
    """Tests for DriveStats model."""
    
    def test_drive_stats_creation(self):
        """Test creating DriveStats."""
        stats = DriveStats(
            total_files=100,
            total_size=1048576,
            folder_count=10,
            file_count=90
        )
        
        assert stats.total_files == 100
        assert stats.total_size == 1048576
        assert stats.folder_count == 10
        assert stats.file_count == 90
    
    def test_drive_stats_empty(self):
        """Test DriveStats with zero values."""
        stats = DriveStats(
            total_files=0,
            total_size=0,
            folder_count=0,
            file_count=0
        )
        
        assert stats.total_files == 0
        assert stats.total_size == 0


@pytest.mark.unit
class TestScanResponse:
    """Tests for ScanResponse model."""
    
    def test_scan_response_creation(self, sample_files):
        """Test creating a ScanResponse."""
        file_items = [FileItem(**f) for f in sample_files]
        stats = DriveStats(
            total_files=5,
            total_size=1051648,
            folder_count=2,
            file_count=3
        )
        
        response = ScanResponse(
            files=file_items,
            children_map={
                'folder1': ['file2', 'folder2'],
                'folder2': ['file3']
            },
            stats=stats
        )
        
        assert len(response.files) == 5
        assert response.stats.total_files == 5
        assert 'folder1' in response.children_map
        assert len(response.children_map['folder1']) == 2
    
    def test_scan_response_empty(self):
        """Test ScanResponse with empty data."""
        response = ScanResponse(
            files=[],
            children_map={},
            stats=DriveStats(
                total_files=0,
                total_size=0,
                folder_count=0,
                file_count=0
            )
        )
        
        assert len(response.files) == 0
        assert len(response.children_map) == 0


@pytest.mark.unit
class TestHealthResponse:
    """Tests for HealthResponse model."""
    
    def test_health_response_default(self):
        """Test HealthResponse with default status."""
        response = HealthResponse()
        assert response.status == "ok"
    
    def test_health_response_custom(self):
        """Test HealthResponse with custom status."""
        response = HealthResponse(status="healthy")
        assert response.status == "healthy"






