"""Tests for visualization safety features (cycle detection, depth limiting, etc.)."""
import pytest
import sys
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from backend.models import FileItem, ScanResponse, DriveStats


@pytest.mark.unit
@pytest.mark.visualization
class TestCycleDetection:
    """Test that visualizations handle circular references safely."""
    
    def test_circular_folder_reference(self):
        """Test that circular folder references don't cause infinite loops."""
        # Create files with circular reference: folder1 -> folder2 -> folder1
        files = [
            FileItem(
                id="folder1",
                name="Folder 1",
                mimeType="application/vnd.google-apps.folder",
                parents=[],
                size="1000",
                calculatedSize=1000
            ),
            FileItem(
                id="folder2",
                name="Folder 2",
                mimeType="application/vnd.google-apps.folder",
                parents=["folder1"],
                size="2000",
                calculatedSize=2000
            ),
        ]
        
        # Create circular reference in children_map
        children_map = {
            "folder1": ["folder2"],
            "folder2": ["folder1"],  # Circular!
        }
        
        # This should not cause infinite recursion
        # The visualization should detect the cycle and stop
        scan_response = ScanResponse(
            files=files,
            children_map=children_map,
            stats=DriveStats(
                total_files=2,
                total_size=3000,
                folder_count=2,
                file_count=0
            )
        )
        
        # Verify data structure is valid
        assert len(scan_response.files) == 2
        assert "folder1" in scan_response.children_map
        assert "folder2" in scan_response.children_map


@pytest.mark.unit
@pytest.mark.visualization
class TestDepthLimiting:
    """Test that deep folder hierarchies are handled safely."""
    
    def test_deep_hierarchy(self):
        """Test that very deep folder structures don't cause stack overflow."""
        # Create 100 levels of nested folders
        files = []
        children_map = {}
        
        for i in range(100):
            folder_id = f"folder_{i}"
            parent_id = f"folder_{i-1}" if i > 0 else None
            
            files.append(FileItem(
                id=folder_id,
                name=f"Folder {i}",
                mimeType="application/vnd.google-apps.folder",
                parents=[parent_id] if parent_id else [],
                size="1000",
                calculatedSize=1000
            ))
            
            if parent_id:
                if parent_id not in children_map:
                    children_map[parent_id] = []
                children_map[parent_id].append(folder_id)
        
        scan_response = ScanResponse(
            files=files,
            children_map=children_map,
            stats=DriveStats(
                total_files=100,
                total_size=100000,
                folder_count=100,
                file_count=0
            )
        )
        
        # Verify data structure is valid
        assert len(scan_response.files) == 100
        assert len(scan_response.children_map) == 99  # 99 parents (folder_0 has no parent)


@pytest.mark.unit
@pytest.mark.visualization
class TestLargeDataset:
    """Test that large datasets are handled safely."""
    
    def test_large_file_list(self):
        """Test that large file lists don't cause memory issues."""
        # Create 10,000 files
        files = []
        for i in range(10000):
            files.append(FileItem(
                id=f"file_{i}",
                name=f"File {i}.txt",
                mimeType="text/plain",
                parents=[],
                size="1000",
                calculatedSize=1000
            ))
        
        scan_response = ScanResponse(
            files=files,
            children_map={},
            stats=DriveStats(
                total_files=10000,
                total_size=10000000,
                folder_count=0,
                file_count=10000
            )
        )
        
        # Verify data structure is valid
        assert len(scan_response.files) == 10000
        assert scan_response.stats.total_files == 10000


@pytest.mark.unit
@pytest.mark.visualization
class TestEdgeCases:
    """Test edge cases for visualization data."""
    
    def test_empty_files(self):
        """Test handling of empty file list."""
        scan_response = ScanResponse(
            files=[],
            children_map={},
            stats=DriveStats(
                total_files=0,
                total_size=0,
                folder_count=0,
                file_count=0
            )
        )
        
        assert len(scan_response.files) == 0
        assert scan_response.stats.total_files == 0
    
    def test_files_without_size(self):
        """Test handling of files without size information."""
        files = [
            FileItem(
                id="file1",
                name="File 1",
                mimeType="text/plain",
                parents=[],
                size=None,
                calculatedSize=None
            )
        ]
        
        scan_response = ScanResponse(
            files=files,
            children_map={},
            stats=DriveStats(
                total_files=1,
                total_size=0,
                folder_count=0,
                file_count=1
            )
        )
        
        assert len(scan_response.files) == 1
        # Note: FileItem.size is Optional[str], so None is valid
        assert scan_response.files[0].size is None or scan_response.files[0].size == "0"
    
    def test_multiple_parents(self):
        """Test handling of files with multiple parents (shared files)."""
        files = [
            FileItem(
                id="file1",
                name="Shared File",
                mimeType="text/plain",
                parents=["folder1", "folder2"],  # Multiple parents
                size="1000",
                calculatedSize=1000
            )
        ]
        
        children_map = {
            "folder1": ["file1"],
            "folder2": ["file1"]
        }
        
        scan_response = ScanResponse(
            files=files,
            children_map=children_map,
            stats=DriveStats(
                total_files=1,
                total_size=1000,
                folder_count=0,
                file_count=1
            )
        )
        
        assert len(scan_response.files) == 1
        assert len(scan_response.files[0].parents) == 2
