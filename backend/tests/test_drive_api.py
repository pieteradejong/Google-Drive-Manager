"""Tests for backend/drive_api.py."""
import pytest
from unittest.mock import MagicMock
from backend.drive_api import list_all_files, build_tree_structure


@pytest.mark.unit
class TestListAllFiles:
    """Tests for list_all_files function."""
    
    def test_list_all_files_empty(self, mock_drive_service):
        """Test listing files when Drive is empty."""
        files = list_all_files(mock_drive_service)
        assert files == []
        assert mock_drive_service.files().list.called
    
    def test_list_all_files_single_page(self, mock_drive_service, sample_files):
        """Test listing files with single page of results."""
        # Configure mock to return files
        mock_execute = mock_drive_service.files().list().execute
        mock_execute.return_value = {
            'files': sample_files[:2],
            'nextPageToken': None
        }
        
        files = list_all_files(mock_drive_service)
        assert len(files) == 2
        assert files[0]['id'] == 'file1'
        assert files[1]['id'] == 'folder1'
    
    def test_list_all_files_multiple_pages(self, mock_drive_service, sample_files):
        """Test listing files with pagination."""
        # First page
        first_page = MagicMock()
        first_page.execute.return_value = {
            'files': sample_files[:2],
            'nextPageToken': 'token123'
        }
        
        # Second page
        second_page = MagicMock()
        second_page.execute.return_value = {
            'files': sample_files[2:],
            'nextPageToken': None
        }
        
        # Configure mock to return different pages
        mock_list = MagicMock()
        mock_list.side_effect = [first_page, second_page]
        mock_drive_service.files.return_value.list = mock_list
        
        files = list_all_files(mock_drive_service)
        assert len(files) == 5
        assert mock_list.call_count == 2
    
    def test_list_all_files_error_handling(self, mock_drive_service):
        """Test error handling in list_all_files."""
        mock_drive_service.files().list().execute.side_effect = Exception("API Error")
        
        files = list_all_files(mock_drive_service)
        # Should return empty list on error
        assert files == []


@pytest.mark.unit
class TestBuildTreeStructure:
    """Tests for build_tree_structure function."""
    
    def test_build_tree_structure_empty(self):
        """Test building tree with empty file list."""
        result = build_tree_structure([])
        
        assert result['files'] == []
        assert result['file_map'] == {}
        assert result['children_map'] == {}
    
    def test_build_tree_structure_simple(self, sample_files):
        """Test building tree with simple structure."""
        files = sample_files[:3]  # file1, folder1, file2
        result = build_tree_structure(files)
        
        assert len(result['files']) == 3
        assert 'file1' in result['file_map']
        assert 'folder1' in result['file_map']
        assert 'file2' in result['file_map']
        
        # Check children_map
        assert 'folder1' in result['children_map']
        assert 'file2' in result['children_map']['folder1']
    
    def test_build_tree_structure_nested(self, sample_files):
        """Test building tree with nested folders."""
        result = build_tree_structure(sample_files)
        
        # Check root items (no parents)
        root_items = [f for f in result['files'] if not f.get('parents')]
        assert len(root_items) == 2  # file1 and folder1
        
        # Check nested structure
        assert 'folder1' in result['children_map']
        assert 'folder2' in result['children_map']['folder1']
        assert 'file2' in result['children_map']['folder1']
        assert 'file3' in result['children_map']['folder2']
    
    def test_calculate_folder_sizes(self, sample_files):
        """Test folder size calculation."""
        result = build_tree_structure(sample_files)
        
        # Find folder1
        folder1 = next(f for f in result['files'] if f['id'] == 'folder1')
        
        # folder1 should have calculatedSize including:
        # - file2: 2048
        # - folder2: calculatedSize (which includes file3: 1048576)
        # Total should be at least file2 + file3 = 2048 + 1048576 = 1050624
        assert 'calculatedSize' in folder1
        assert folder1['calculatedSize'] >= 1050624
        
        # Find folder2
        folder2 = next(f for f in result['files'] if f['id'] == 'folder2')
        assert 'calculatedSize' in folder2
        assert folder2['calculatedSize'] == 1048576  # Just file3
    
    def test_calculate_file_sizes(self, sample_files):
        """Test that files have their direct size."""
        result = build_tree_structure(sample_files)
        
        file1 = next(f for f in result['files'] if f['id'] == 'file1')
        # Files shouldn't have calculatedSize, they have direct size
        assert file1.get('size') == '1024' or int(file1.get('size', 0)) == 1024
    
    def test_multiple_parents(self):
        """Test handling files with multiple parents (shared files)."""
        files = [
            {
                'id': 'shared_file',
                'name': 'Shared.txt',
                'mimeType': 'text/plain',
                'size': '512',
                'parents': ['folder1', 'folder2'],
                'createdTime': '2024-01-01T00:00:00Z',
                'modifiedTime': '2024-01-01T00:00:00Z',
                'webViewLink': 'https://drive.google.com/file/d/shared_file/view'
            },
            {
                'id': 'folder1',
                'name': 'Folder 1',
                'mimeType': 'application/vnd.google-apps.folder',
                'size': None,
                'parents': [],
                'createdTime': '2024-01-01T00:00:00Z',
                'modifiedTime': '2024-01-01T00:00:00Z',
                'webViewLink': 'https://drive.google.com/drive/folders/folder1'
            },
            {
                'id': 'folder2',
                'name': 'Folder 2',
                'mimeType': 'application/vnd.google-apps.folder',
                'size': None,
                'parents': [],
                'createdTime': '2024-01-01T00:00:00Z',
                'modifiedTime': '2024-01-01T00:00:00Z',
                'webViewLink': 'https://drive.google.com/drive/folders/folder2'
            }
        ]
        
        result = build_tree_structure(files)
        
        # Shared file should appear in both folders' children
        assert 'shared_file' in result['children_map']['folder1']
        assert 'shared_file' in result['children_map']['folder2']

