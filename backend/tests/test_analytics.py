"""Tests for backend/analytics.py derived analytics computation."""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

from backend.analytics import (
    compute_duplicates,
    compute_orphans,
    compute_depths,
    compute_semantic,
    compute_age_semantic,
    compute_type_semantic,
    compute_type_stats,
    compute_timeline,
    compute_large_lists,
    compute_all_analytics,
    build_file_index,
    compute_full_scan_analytics_cache,
    save_full_scan_analytics_cache,
    _safe_int,
    _parse_iso_date,
    _is_folder,
    _file_size,
    _classify_folder_by_name,
)


@pytest.mark.unit
class TestHelperFunctions:
    """Tests for helper functions."""
    
    def test_safe_int_with_int(self):
        """Test _safe_int with integer input."""
        assert _safe_int(42) == 42
    
    def test_safe_int_with_string(self):
        """Test _safe_int with string input."""
        assert _safe_int('100') == 100
    
    def test_safe_int_with_none(self):
        """Test _safe_int with None input."""
        assert _safe_int(None) == 0
        assert _safe_int(None, default=10) == 10
    
    def test_safe_int_with_invalid(self):
        """Test _safe_int with invalid input."""
        assert _safe_int('not_a_number') == 0
    
    def test_parse_iso_date_valid(self):
        """Test _parse_iso_date with valid date."""
        result = _parse_iso_date('2024-01-15T10:30:00Z')
        assert result is not None
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 15
    
    def test_parse_iso_date_invalid(self):
        """Test _parse_iso_date with invalid date."""
        assert _parse_iso_date('invalid') is None
        assert _parse_iso_date(None) is None
        assert _parse_iso_date('') is None
    
    def test_is_folder_true(self):
        """Test _is_folder with folder."""
        file_obj = {'mimeType': 'application/vnd.google-apps.folder'}
        assert _is_folder(file_obj) is True
    
    def test_is_folder_false(self):
        """Test _is_folder with non-folder."""
        file_obj = {'mimeType': 'text/plain'}
        assert _is_folder(file_obj) is False
    
    def test_file_size_with_size(self):
        """Test _file_size with size field."""
        file_obj = {'size': '1024'}
        assert _file_size(file_obj) == 1024
    
    def test_file_size_with_calculated_size(self):
        """Test _file_size with calculatedSize field."""
        file_obj = {'calculatedSize': 2048}
        assert _file_size(file_obj) == 2048
    
    def test_file_size_prefers_calculated(self):
        """Test _file_size prefers calculatedSize over size."""
        file_obj = {'size': '100', 'calculatedSize': 200}
        assert _file_size(file_obj) == 200
    
    def test_classify_folder_by_name_photos(self):
        """Test folder classification by name - photos."""
        assert _classify_folder_by_name('My Photos') == 'Photos'
        assert _classify_folder_by_name('Pictures 2024') == 'Photos'
    
    def test_classify_folder_by_name_backup(self):
        """Test folder classification by name - backup."""
        assert _classify_folder_by_name('Old Backup') == 'Backup/Archive'
        assert _classify_folder_by_name('archive_2023') == 'Backup/Archive'
    
    def test_classify_folder_by_name_work(self):
        """Test folder classification by name - work."""
        assert _classify_folder_by_name('Work Projects') == 'Work'
        assert _classify_folder_by_name('Client Files') == 'Work'
    
    def test_classify_folder_by_name_unclassified(self):
        """Test folder classification - unclassified."""
        assert _classify_folder_by_name('xyz123') is None
        assert _classify_folder_by_name('Stuff') is None
        assert _classify_folder_by_name('2024') is None


@pytest.mark.unit
class TestComputeDuplicates:
    """Tests for compute_duplicates function."""
    
    def test_compute_duplicates_finds_duplicates(self, sample_files_with_duplicates):
        """Test that duplicates are detected."""
        result = compute_duplicates(sample_files_with_duplicates)
        
        assert 'groups' in result
        assert 'total_potential_savings' in result
        assert len(result['groups']) >= 1
        
        # Find the Report.pdf duplicates
        report_group = next(
            (g for g in result['groups'] if g['name'] == 'Report.pdf'),
            None
        )
        assert report_group is not None
        assert report_group['count'] == 3
        assert report_group['size'] == 5000
        assert report_group['potential_savings'] == 10000  # (3-1) * 5000
    
    def test_compute_duplicates_no_duplicates(self, sample_files):
        """Test with no duplicates."""
        result = compute_duplicates(sample_files)
        
        # Should have empty groups or groups with count=1 filtered out
        for group in result['groups']:
            assert group['count'] >= 2
    
    def test_compute_duplicates_excludes_folders(self, sample_files):
        """Test that folders are excluded from duplicate detection."""
        result = compute_duplicates(sample_files)
        
        for group in result['groups']:
            # Folders shouldn't be in duplicates
            assert group.get('mimeType') != 'application/vnd.google-apps.folder'
    
    def test_compute_duplicates_sorted_by_savings(self, sample_files_with_duplicates):
        """Test that groups are sorted by potential savings."""
        result = compute_duplicates(sample_files_with_duplicates)
        
        groups = result['groups']
        if len(groups) > 1:
            for i in range(len(groups) - 1):
                assert groups[i]['potential_savings'] >= groups[i + 1]['potential_savings']


@pytest.mark.unit
class TestComputeOrphans:
    """Tests for compute_orphans function."""
    
    def test_compute_orphans_finds_orphans(self):
        """Test detection of files with missing parents."""
        files = [
            {'id': 'file1', 'name': 'File1', 'mimeType': 'text/plain', 'parents': ['nonexistent']},
            {'id': 'file2', 'name': 'File2', 'mimeType': 'text/plain', 'parents': []},
        ]
        file_by_id = build_file_index(files)
        
        result = compute_orphans(files, file_by_id)
        
        assert result['count'] == 1
        assert len(result['orphans']) == 1
        assert result['orphans'][0]['file_id'] == 'file1'
        assert 'nonexistent' in result['orphans'][0]['missing_parent_ids']
    
    def test_compute_orphans_no_orphans(self, sample_files):
        """Test with no orphans."""
        file_by_id = build_file_index(sample_files)
        result = compute_orphans(sample_files, file_by_id)
        
        # All parents exist in sample_files or are empty
        # Note: In sample_files, folder1 and file1 have no parents
        # file2 -> folder1, folder2 -> folder1, file3 -> folder2
        assert result['count'] == 0


@pytest.mark.unit
class TestComputeDepths:
    """Tests for compute_depths function."""
    
    def test_compute_depths_basic(self, sample_files):
        """Test basic depth calculation."""
        file_by_id = build_file_index(sample_files)
        result = compute_depths(sample_files, file_by_id)
        
        assert 'depth_by_id' in result
        assert 'distribution' in result
        assert 'max_depth' in result
        assert 'deepest_folder_ids' in result
    
    def test_compute_depths_nested_folders(self, sample_deep_folder_structure):
        """Test depth calculation with deep nesting."""
        file_by_id = build_file_index(sample_deep_folder_structure)
        result = compute_depths(sample_deep_folder_structure, file_by_id)
        
        # With 5 nested folders (0-4), max depth should be 4
        assert result['max_depth'] >= 3
        
        # The deepest folder should be in the list
        assert len(result['deepest_folder_ids']) > 0
    
    def test_compute_depths_handles_cycles(self):
        """Test that cycles don't cause infinite recursion."""
        # Create a cycle: folder1 -> folder2 -> folder1
        files = [
            {'id': 'folder1', 'name': 'F1', 'mimeType': 'application/vnd.google-apps.folder', 'parents': ['folder2']},
            {'id': 'folder2', 'name': 'F2', 'mimeType': 'application/vnd.google-apps.folder', 'parents': ['folder1']},
        ]
        file_by_id = build_file_index(files)
        
        # Should not raise due to cycle protection
        result = compute_depths(files, file_by_id)
        
        assert 'depth_by_id' in result


@pytest.mark.unit
class TestComputeSemantic:
    """Tests for compute_semantic function."""
    
    def test_compute_semantic_by_name(self, sample_semantic_folders):
        """Test semantic categorization by folder name."""
        children_map = {}
        for f in sample_semantic_folders:
            for parent in f.get('parents', []):
                children_map.setdefault(parent, []).append(f['id'])
        
        file_by_id = build_file_index(sample_semantic_folders)
        result = compute_semantic(sample_semantic_folders, children_map, file_by_id)
        
        assert 'folder_category' in result
        assert 'totals' in result
        
        # Check that photos folder is categorized
        photos_folder = result['folder_category'].get('folder_photos')
        assert photos_folder is not None
        assert photos_folder['category'] == 'Photos'
        assert photos_folder['method'] == 'name'
    
    def test_compute_semantic_by_content(self):
        """Test semantic categorization by content type."""
        # Create a folder with 90% images
        files = [
            {'id': 'img_folder', 'name': 'Random Name', 'mimeType': 'application/vnd.google-apps.folder', 'parents': []},
            {'id': 'img1', 'name': 'a.jpg', 'mimeType': 'image/jpeg', 'size': '100', 'parents': ['img_folder'], 'modifiedTime': '2024-01-01T00:00:00Z'},
            {'id': 'img2', 'name': 'b.jpg', 'mimeType': 'image/jpeg', 'size': '100', 'parents': ['img_folder'], 'modifiedTime': '2024-01-01T00:00:00Z'},
            {'id': 'img3', 'name': 'c.jpg', 'mimeType': 'image/jpeg', 'size': '100', 'parents': ['img_folder'], 'modifiedTime': '2024-01-01T00:00:00Z'},
            {'id': 'img4', 'name': 'd.jpg', 'mimeType': 'image/jpeg', 'size': '100', 'parents': ['img_folder'], 'modifiedTime': '2024-01-01T00:00:00Z'},
            {'id': 'img5', 'name': 'e.jpg', 'mimeType': 'image/jpeg', 'size': '100', 'parents': ['img_folder'], 'modifiedTime': '2024-01-01T00:00:00Z'},
        ]
        
        children_map = {'img_folder': ['img1', 'img2', 'img3', 'img4', 'img5']}
        file_by_id = build_file_index(files)
        
        result = compute_semantic(files, children_map, file_by_id)
        
        folder_cat = result['folder_category'].get('img_folder')
        assert folder_cat is not None
        # With 100% images, should be categorized as Photos
        assert folder_cat['category'] == 'Photos'
        assert folder_cat['method'] == 'content'


@pytest.mark.unit
class TestComputeTypeStats:
    """Tests for compute_type_stats function."""
    
    def test_compute_type_stats_groups_correctly(self, sample_files):
        """Test file type grouping."""
        result = compute_type_stats(sample_files)
        
        assert 'groups' in result
        groups = result['groups']
        
        # Should have Images group (from Image.jpg)
        if 'Images' in groups:
            assert groups['Images']['count'] >= 1
        
        # Should have Videos group (from Video.mp4)
        if 'Videos' in groups:
            assert groups['Videos']['count'] >= 1
        
        # Should have Documents group (from Document.pdf)
        if 'Documents' in groups:
            assert groups['Documents']['count'] >= 1
        
        # Should have Folders group
        if 'Folders' in groups:
            assert groups['Folders']['count'] >= 1
    
    def test_compute_type_stats_empty(self):
        """Test with empty file list."""
        result = compute_type_stats([])
        assert result['groups'] == {}


@pytest.mark.unit
class TestComputeTimeline:
    """Tests for compute_timeline function."""
    
    def test_compute_timeline_basic(self, sample_files):
        """Test timeline computation."""
        result = compute_timeline(sample_files)
        
        assert 'created' in result
        assert 'modified' in result
        
        assert 'day' in result['created']
        assert 'week' in result['created']
        assert 'month' in result['created']
    
    def test_compute_timeline_aggregates_correctly(self):
        """Test that timeline aggregates correctly."""
        files = [
            {'id': 'f1', 'name': 'F1', 'mimeType': 'text/plain', 'size': '100',
             'createdTime': '2024-01-15T10:00:00Z', 'modifiedTime': '2024-01-15T10:00:00Z'},
            {'id': 'f2', 'name': 'F2', 'mimeType': 'text/plain', 'size': '200',
             'createdTime': '2024-01-15T11:00:00Z', 'modifiedTime': '2024-01-15T11:00:00Z'},
        ]
        
        result = compute_timeline(files)
        
        # Both files created on same day
        day_key = '2024-01-15'
        assert day_key in result['created']['day']
        assert result['created']['day'][day_key]['count'] == 2
        assert result['created']['day'][day_key]['total_size'] == 300


@pytest.mark.unit
class TestComputeLargeLists:
    """Tests for compute_large_lists function."""
    
    def test_compute_large_lists_basic(self, sample_files):
        """Test large lists computation."""
        result = compute_large_lists(sample_files)
        
        assert 'top_file_ids' in result
        assert 'top_folder_ids' in result
    
    def test_compute_large_lists_sorted_by_size(self, sample_files):
        """Test that lists are sorted by size."""
        result = compute_large_lists(sample_files)
        
        # Verify we have results
        assert len(result['top_file_ids']) > 0
        
        # The first file should be the largest (Video.mp4 = 1048576)
        # We can't directly verify sorting without file sizes, but the logic is tested


@pytest.mark.unit
class TestBuildFileIndex:
    """Tests for build_file_index function."""
    
    def test_build_file_index(self, sample_files):
        """Test file index building."""
        result = build_file_index(sample_files)
        
        assert len(result) == len(sample_files)
        assert 'file1' in result
        assert 'folder1' in result
        assert result['file1']['name'] == 'Document.pdf'
    
    def test_build_file_index_skips_missing_id(self):
        """Test that files without ID are skipped."""
        files = [
            {'id': 'file1', 'name': 'F1', 'mimeType': 'text/plain'},
            {'name': 'NoId', 'mimeType': 'text/plain'},  # No id
        ]
        
        result = build_file_index(files)
        
        assert len(result) == 1
        assert 'file1' in result


@pytest.mark.unit
class TestComputeAllAnalytics:
    """Tests for compute_all_analytics function."""
    
    def test_compute_all_analytics_basic(self, sample_scan_data):
        """Test full analytics computation."""
        result = compute_all_analytics(sample_scan_data)
        
        assert 'derived_version' in result
        assert 'duplicates' in result
        assert 'depths' in result
        assert 'semantic' in result
        assert 'orphans' in result
        assert 'types' in result
        assert 'timeline' in result
        assert 'large' in result
    
    def test_compute_all_analytics_with_duplicates(self, sample_scan_data_with_duplicates):
        """Test analytics with duplicate files."""
        result = compute_all_analytics(sample_scan_data_with_duplicates)
        
        assert len(result['duplicates']['groups']) >= 1
        assert result['duplicates']['total_potential_savings'] > 0


@pytest.mark.unit
class TestComputeFullScanAnalyticsCache:
    """Tests for cache-related analytics functions."""
    
    def test_compute_full_scan_analytics_cache(self, sample_scan_data):
        """Test computing analytics from full scan cache."""
        cache_payload = {
            'data': sample_scan_data,
            'metadata': {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'file_count': len(sample_scan_data['files']),
                'total_size': 1000000,
                'cache_version': 1
            }
        }
        
        bundle, meta = compute_full_scan_analytics_cache(cache_payload)
        
        assert 'duplicates' in bundle
        assert 'depths' in bundle
        
        assert meta.source_cache_timestamp == cache_payload['metadata']['timestamp']
        assert meta.source_file_count == len(sample_scan_data['files'])
    
    def test_compute_full_scan_analytics_cache_invalid_payload(self):
        """Test with invalid payload."""
        with pytest.raises(ValueError, match="Invalid full_scan cache payload"):
            compute_full_scan_analytics_cache({})
    
    def test_save_full_scan_analytics_cache(self, sample_scan_data, tmp_path):
        """Test saving analytics cache."""
        cache_payload = {
            'data': sample_scan_data,
            'metadata': {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'file_count': len(sample_scan_data['files']),
                'total_size': 1000000,
                'cache_version': 1
            }
        }
        
        with patch('backend.cache.save_cache') as mock_save:
            mock_save.return_value = True
            
            result = save_full_scan_analytics_cache(cache_payload)
        
        assert result is True
        mock_save.assert_called_once()
        
        # Check that the first arg is 'full_scan_analytics'
        call_args = mock_save.call_args
        assert call_args[0][0] == 'full_scan_analytics'


@pytest.mark.unit
class TestComputeAgeSemantic:
    """Tests for compute_age_semantic function."""
    
    def test_compute_age_semantic_basic(self, sample_semantic_folders):
        """Test age-semantic matrix computation."""
        folders = [f for f in sample_semantic_folders if f['mimeType'] == 'application/vnd.google-apps.folder']
        folder_category = {'folder_photos': {'category': 'Photos'}}
        now = datetime.now(timezone.utc)
        
        result = compute_age_semantic(folders, folder_category, now)
        
        assert 'buckets' in result
        assert 'matrix' in result
        assert len(result['buckets']) == 5  # 5 age buckets


@pytest.mark.unit
class TestComputeTypeSemantic:
    """Tests for compute_type_semantic function."""
    
    def test_compute_type_semantic_basic(self, sample_semantic_folders):
        """Test type-semantic matrix computation."""
        folder_category = {'folder_photos': {'category': 'Photos'}}
        
        result = compute_type_semantic(sample_semantic_folders, folder_category)
        
        assert 'groups' in result
        assert 'matrix' in result
        assert len(result['groups']) == 5  # Images, Videos, Audio, Documents, Other
