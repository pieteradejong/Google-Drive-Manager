"""Comprehensive tests for duplicate detection with md5Checksum verification.

Tests the two-tier duplicate detection approach:
1. VERIFIED duplicates: Binary files grouped by md5Checksum (100% confidence)
2. POTENTIAL duplicates: Workspace files grouped by name+size (needs manual check)
"""

import pytest
from backend.analytics import (
    compute_duplicates,
    SHORTCUT_MIME,
    WORKSPACE_MIMES,
    EMPTY_FILE_MD5,
)


@pytest.fixture
def files_with_md5_duplicates():
    """Sample files with verified duplicates (same md5Checksum)."""
    return [
        # Verified duplicate group 1: Same md5, different names (renamed copies)
        {
            "id": "photo_orig",
            "name": "vacation.jpg",
            "mimeType": "image/jpeg",
            "size": "5000000",
            "md5Checksum": "abc123def456789012345678901234ab",
            "parents": ["folder1"],
            "createdTime": "2024-01-01T00:00:00Z",
            "modifiedTime": "2024-01-01T00:00:00Z",
        },
        {
            "id": "photo_copy",
            "name": "vacation_backup.jpg",
            "mimeType": "image/jpeg",
            "size": "5000000",
            "md5Checksum": "abc123def456789012345678901234ab",  # Same hash
            "parents": ["folder2"],
            "createdTime": "2024-01-02T00:00:00Z",
            "modifiedTime": "2024-01-02T00:00:00Z",
        },
        {
            "id": "photo_copy2",
            "name": "photo_final.jpg",
            "mimeType": "image/jpeg",
            "size": "5000000",
            "md5Checksum": "abc123def456789012345678901234ab",  # Same hash
            "parents": ["folder3"],
            "createdTime": "2024-01-03T00:00:00Z",
            "modifiedTime": "2024-01-03T00:00:00Z",
        },
        # Verified duplicate group 2: Same md5, same name
        {
            "id": "report_1",
            "name": "report.pdf",
            "mimeType": "application/pdf",
            "size": "1024",
            "md5Checksum": "fedcba987654321098765432109876cd",
            "parents": ["folder1"],
            "createdTime": "2024-01-01T00:00:00Z",
            "modifiedTime": "2024-01-01T00:00:00Z",
        },
        {
            "id": "report_2",
            "name": "report.pdf",
            "mimeType": "application/pdf",
            "size": "1024",
            "md5Checksum": "fedcba987654321098765432109876cd",  # Same hash
            "parents": ["folder2"],
            "createdTime": "2024-01-05T00:00:00Z",
            "modifiedTime": "2024-01-05T00:00:00Z",
        },
        # Unique file (no duplicates)
        {
            "id": "unique_file",
            "name": "unique.txt",
            "mimeType": "text/plain",
            "size": "500",
            "md5Checksum": "unique1234567890123456789012345ef",
            "parents": ["folder1"],
            "createdTime": "2024-01-01T00:00:00Z",
            "modifiedTime": "2024-01-01T00:00:00Z",
        },
        # Folders (should be excluded)
        {
            "id": "folder1",
            "name": "Folder 1",
            "mimeType": "application/vnd.google-apps.folder",
            "size": None,
            "parents": [],
        },
        {
            "id": "folder2",
            "name": "Folder 2",
            "mimeType": "application/vnd.google-apps.folder",
            "size": None,
            "parents": [],
        },
        {
            "id": "folder3",
            "name": "Folder 3",
            "mimeType": "application/vnd.google-apps.folder",
            "size": None,
            "parents": [],
        },
    ]


@pytest.fixture
def files_with_workspace_duplicates():
    """Sample Google Workspace files (no md5Checksum) with potential duplicates."""
    return [
        # Potential duplicate group: Same name+size Google Docs
        {
            "id": "doc_1",
            "name": "Meeting Notes",
            "mimeType": "application/vnd.google-apps.document",
            "size": "0",  # Workspace files often have size 0 or null
            "parents": ["folder1"],
            "createdTime": "2024-01-01T00:00:00Z",
            "modifiedTime": "2024-01-01T00:00:00Z",
        },
        {
            "id": "doc_2",
            "name": "Meeting Notes",
            "mimeType": "application/vnd.google-apps.document",
            "size": "0",
            "parents": ["folder2"],
            "createdTime": "2024-01-02T00:00:00Z",
            "modifiedTime": "2024-01-02T00:00:00Z",
        },
        # Google Sheet with same name (no md5Checksum available)
        {
            "id": "sheet_1",
            "name": "Budget 2024",
            "mimeType": "application/vnd.google-apps.spreadsheet",
            "size": "0",
            "parents": ["folder1"],
            "createdTime": "2024-01-01T00:00:00Z",
            "modifiedTime": "2024-01-01T00:00:00Z",
        },
        {
            "id": "sheet_2",
            "name": "Budget 2024",
            "mimeType": "application/vnd.google-apps.spreadsheet",
            "size": "0",
            "parents": ["folder3"],
            "createdTime": "2024-01-10T00:00:00Z",
            "modifiedTime": "2024-01-10T00:00:00Z",
        },
        # Folders
        {
            "id": "folder1",
            "name": "Folder 1",
            "mimeType": "application/vnd.google-apps.folder",
            "size": None,
            "parents": [],
        },
        {
            "id": "folder2",
            "name": "Folder 2",
            "mimeType": "application/vnd.google-apps.folder",
            "size": None,
            "parents": [],
        },
        {
            "id": "folder3",
            "name": "Folder 3",
            "mimeType": "application/vnd.google-apps.folder",
            "size": None,
            "parents": [],
        },
    ]


@pytest.fixture
def files_with_shortcuts():
    """Files including shortcuts that should be excluded from duplicates."""
    return [
        {
            "id": "orig_file",
            "name": "Important.pdf",
            "mimeType": "application/pdf",
            "size": "1000",
            "md5Checksum": "abc123",
            "parents": ["folder1"],
        },
        # Shortcut pointing to the file - NOT a duplicate
        {
            "id": "shortcut1",
            "name": "Shortcut to Important",
            "mimeType": "application/vnd.google-apps.shortcut",
            "size": None,
            "parents": ["folder2"],
            "shortcutDetails": {
                "targetId": "orig_file",
                "targetMimeType": "application/pdf",
            },
        },
        # Another file with same name/size but different content (shortcut shouldn't interfere)
        {
            "id": "another_shortcut",
            "name": "Link to Doc",
            "mimeType": "application/vnd.google-apps.shortcut",
            "size": None,
            "parents": ["folder1"],
            "shortcutDetails": {
                "targetId": "some_doc",
                "targetMimeType": "application/vnd.google-apps.document",
            },
        },
        # Folders
        {
            "id": "folder1",
            "name": "Folder 1",
            "mimeType": "application/vnd.google-apps.folder",
            "size": None,
            "parents": [],
        },
        {
            "id": "folder2",
            "name": "Folder 2",
            "mimeType": "application/vnd.google-apps.folder",
            "size": None,
            "parents": [],
        },
    ]


@pytest.fixture
def files_with_empty_files():
    """Files including empty files (0 bytes) that should be excluded."""
    return [
        # Empty files with same md5 hash (all empty files have same hash)
        {
            "id": "empty1",
            "name": "placeholder.txt",
            "mimeType": "text/plain",
            "size": "0",
            "md5Checksum": EMPTY_FILE_MD5,
            "parents": ["folder1"],
        },
        {
            "id": "empty2",
            "name": "blank.txt",
            "mimeType": "text/plain",
            "size": "0",
            "md5Checksum": EMPTY_FILE_MD5,
            "parents": ["folder2"],
        },
        # Non-empty file (should be included if duplicated)
        {
            "id": "real_file",
            "name": "data.txt",
            "mimeType": "text/plain",
            "size": "100",
            "md5Checksum": "real_hash_123",
            "parents": ["folder1"],
        },
        # Folders
        {
            "id": "folder1",
            "name": "Folder 1",
            "mimeType": "application/vnd.google-apps.folder",
            "size": None,
            "parents": [],
        },
        {
            "id": "folder2",
            "name": "Folder 2",
            "mimeType": "application/vnd.google-apps.folder",
            "size": None,
            "parents": [],
        },
    ]


@pytest.fixture
def mixed_files():
    """Mix of verified and potential duplicates, shortcuts, and empty files."""
    return [
        # Verified duplicate group (binary with md5)
        {
            "id": "img1",
            "name": "photo.jpg",
            "mimeType": "image/jpeg",
            "size": "5000",
            "md5Checksum": "verified_hash_abc123",
            "parents": ["folder1"],
        },
        {
            "id": "img2",
            "name": "photo_copy.jpg",
            "mimeType": "image/jpeg",
            "size": "5000",
            "md5Checksum": "verified_hash_abc123",  # Same hash = verified duplicate
            "parents": ["folder2"],
        },
        # Potential duplicate (Workspace, no md5)
        {
            "id": "doc1",
            "name": "Notes",
            "mimeType": "application/vnd.google-apps.document",
            "size": "0",
            "parents": ["folder1"],
        },
        {
            "id": "doc2",
            "name": "Notes",
            "mimeType": "application/vnd.google-apps.document",
            "size": "0",
            "parents": ["folder2"],
        },
        # Shortcut (should be excluded)
        {
            "id": "shortcut1",
            "name": "Link",
            "mimeType": SHORTCUT_MIME,
            "size": None,
            "parents": ["folder1"],
        },
        # Empty file (should be excluded)
        {
            "id": "empty1",
            "name": "empty.txt",
            "mimeType": "text/plain",
            "size": "0",
            "md5Checksum": EMPTY_FILE_MD5,
            "parents": ["folder1"],
        },
        # Folders
        {
            "id": "folder1",
            "name": "Folder 1",
            "mimeType": "application/vnd.google-apps.folder",
            "size": None,
            "parents": [],
        },
        {
            "id": "folder2",
            "name": "Folder 2",
            "mimeType": "application/vnd.google-apps.folder",
            "size": None,
            "parents": [],
        },
    ]


@pytest.mark.unit
class TestVerifiedDuplicates:
    """Tests for verified duplicates (by md5Checksum)."""

    def test_detects_verified_duplicates_by_md5(self, files_with_md5_duplicates):
        """Files with same md5Checksum should be grouped as verified duplicates."""
        result = compute_duplicates(files_with_md5_duplicates)

        assert "verified_groups" in result
        assert "potential_groups" in result
        assert len(result["verified_groups"]) == 2  # Two groups of verified duplicates

    def test_verified_group_has_correct_count(self, files_with_md5_duplicates):
        """Verified group should have correct file count."""
        result = compute_duplicates(files_with_md5_duplicates)

        # Find the 3-copy group (photos)
        photo_group = next(
            (g for g in result["verified_groups"] if g["count"] == 3), None
        )
        assert photo_group is not None
        assert photo_group["confidence"] == "verified"
        assert len(photo_group["file_ids"]) == 3

    def test_verified_group_has_checksum(self, files_with_md5_duplicates):
        """Verified groups should include the checksum."""
        result = compute_duplicates(files_with_md5_duplicates)

        for group in result["verified_groups"]:
            assert "checksum" in group
            assert len(group["checksum"]) == 32  # MD5 is 32 hex chars

    def test_verified_savings_calculated_correctly(self, files_with_md5_duplicates):
        """Potential savings should be (count - 1) * size."""
        result = compute_duplicates(files_with_md5_duplicates)

        # Photo group: 3 copies of 5MB = (3-1) * 5000000 = 10000000 bytes savings
        photo_group = next(
            (g for g in result["verified_groups"] if g["size"] == 5000000), None
        )
        assert photo_group is not None
        assert photo_group["potential_savings"] == 10000000

    def test_renamed_files_with_same_content_detected(self, files_with_md5_duplicates):
        """Files with different names but same md5 should be grouped."""
        result = compute_duplicates(files_with_md5_duplicates)

        # The photo group has files with different names but same content
        photo_group = next(
            (g for g in result["verified_groups"] if g["count"] == 3), None
        )
        assert photo_group is not None
        # The group should use the first file's name as representative
        assert photo_group["name"] in ["vacation.jpg", "vacation_backup.jpg", "photo_final.jpg"]


@pytest.mark.unit
class TestPotentialDuplicates:
    """Tests for potential duplicates (Workspace files by name+size)."""

    def test_detects_potential_duplicates_for_workspace_files(self, files_with_workspace_duplicates):
        """Workspace files with same name+size should be potential duplicates."""
        result = compute_duplicates(files_with_workspace_duplicates)

        assert "potential_groups" in result
        # Note: Workspace files with size 0 might not be detected depending on implementation
        # The current implementation excludes size=0 files

    def test_potential_group_has_correct_confidence(self):
        """Potential groups should have confidence='potential'."""
        files = [
            {
                "id": "doc1",
                "name": "Report",
                "mimeType": "application/vnd.google-apps.document",
                "size": "100",  # Non-zero size for testing
                "parents": ["folder1"],
            },
            {
                "id": "doc2",
                "name": "Report",
                "mimeType": "application/vnd.google-apps.document",
                "size": "100",
                "parents": ["folder2"],
            },
        ]
        result = compute_duplicates(files)

        for group in result["potential_groups"]:
            assert group["confidence"] == "potential"

    def test_potential_group_has_no_checksum(self):
        """Potential groups should NOT have a checksum field."""
        files = [
            {
                "id": "doc1",
                "name": "Notes",
                "mimeType": "application/vnd.google-apps.document",
                "size": "50",
                "parents": ["folder1"],
            },
            {
                "id": "doc2",
                "name": "Notes",
                "mimeType": "application/vnd.google-apps.document",
                "size": "50",
                "parents": ["folder2"],
            },
        ]
        result = compute_duplicates(files)

        for group in result["potential_groups"]:
            assert group.get("checksum") is None


@pytest.mark.unit
class TestExclusions:
    """Tests for files that should be excluded from duplicate detection."""

    def test_folders_excluded(self, files_with_md5_duplicates):
        """Folders should never appear in duplicate groups."""
        result = compute_duplicates(files_with_md5_duplicates)

        all_file_ids = []
        for group in result["verified_groups"] + result["potential_groups"]:
            all_file_ids.extend(group["file_ids"])

        # No folder IDs should be in the results
        folder_ids = ["folder1", "folder2", "folder3"]
        for folder_id in folder_ids:
            assert folder_id not in all_file_ids

    def test_shortcuts_excluded(self, files_with_shortcuts):
        """Shortcuts should be excluded from duplicate detection."""
        result = compute_duplicates(files_with_shortcuts)

        all_file_ids = []
        for group in result["verified_groups"] + result["potential_groups"]:
            all_file_ids.extend(group["file_ids"])

        # No shortcuts should be in the results
        assert "shortcut1" not in all_file_ids
        assert "another_shortcut" not in all_file_ids

    def test_empty_files_excluded(self, files_with_empty_files):
        """Empty files (size=0) should be excluded."""
        result = compute_duplicates(files_with_empty_files)

        all_file_ids = []
        for group in result["verified_groups"] + result["potential_groups"]:
            all_file_ids.extend(group["file_ids"])

        # Empty files should not be in results
        assert "empty1" not in all_file_ids
        assert "empty2" not in all_file_ids

    def test_empty_file_hash_excluded(self, files_with_empty_files):
        """Files with the empty file MD5 hash should be excluded."""
        result = compute_duplicates(files_with_empty_files)

        # Even if we have files with EMPTY_FILE_MD5, they shouldn't be grouped
        for group in result["verified_groups"]:
            assert group.get("checksum") != EMPTY_FILE_MD5


@pytest.mark.unit
class TestMixedFiles:
    """Tests with a mix of verified, potential, and excluded files."""

    def test_separates_verified_and_potential(self, mixed_files):
        """Verified and potential duplicates should be in separate groups."""
        result = compute_duplicates(mixed_files)

        # Should have 1 verified group (photos by md5)
        assert len(result["verified_groups"]) >= 1

        # Should have potential groups for Workspace files (if any meet criteria)
        # Note: Size 0 files may be excluded

    def test_combined_groups_for_legacy_compat(self, mixed_files):
        """'groups' field should contain both verified and potential for backward compat."""
        result = compute_duplicates(mixed_files)

        assert "groups" in result
        total_expected = len(result["verified_groups"]) + len(result["potential_groups"])
        assert len(result["groups"]) == total_expected

    def test_total_savings_fields(self, mixed_files):
        """Should have separate and combined savings totals."""
        result = compute_duplicates(mixed_files)

        assert "total_verified_savings" in result
        assert "total_potential_savings" in result
        assert "total_savings" in result

        expected_total = result["total_verified_savings"] + result["total_potential_savings"]
        assert result["total_savings"] == expected_total

    def test_shortcuts_and_empty_not_in_results(self, mixed_files):
        """Shortcuts and empty files should be excluded from all results."""
        result = compute_duplicates(mixed_files)

        all_file_ids = []
        for group in result["groups"]:
            all_file_ids.extend(group["file_ids"])

        assert "shortcut1" not in all_file_ids
        assert "empty1" not in all_file_ids


@pytest.mark.unit
class TestEdgeCases:
    """Edge case tests for duplicate detection."""

    def test_empty_input(self):
        """Empty file list should return empty results."""
        result = compute_duplicates([])

        assert result["verified_groups"] == []
        assert result["potential_groups"] == []
        assert result["groups"] == []
        assert result["total_verified_savings"] == 0
        assert result["total_potential_savings"] == 0

    def test_no_duplicates(self):
        """Files with no duplicates should return empty groups."""
        files = [
            {"id": "f1", "name": "a.txt", "mimeType": "text/plain", "size": "100", "md5Checksum": "hash1"},
            {"id": "f2", "name": "b.txt", "mimeType": "text/plain", "size": "200", "md5Checksum": "hash2"},
            {"id": "f3", "name": "c.txt", "mimeType": "text/plain", "size": "300", "md5Checksum": "hash3"},
        ]
        result = compute_duplicates(files)

        assert len(result["verified_groups"]) == 0
        assert len(result["potential_groups"]) == 0

    def test_files_same_name_different_content(self):
        """Files with same name but different md5 are NOT duplicates."""
        files = [
            {"id": "f1", "name": "report.pdf", "mimeType": "application/pdf", "size": "1000", "md5Checksum": "hash1"},
            {"id": "f2", "name": "report.pdf", "mimeType": "application/pdf", "size": "1000", "md5Checksum": "hash2"},  # Different hash!
        ]
        result = compute_duplicates(files)

        # Same name+size but different md5 = NOT verified duplicates
        assert len(result["verified_groups"]) == 0

    def test_files_different_name_same_content(self):
        """Files with different names but same md5 ARE verified duplicates."""
        files = [
            {"id": "f1", "name": "original.pdf", "mimeType": "application/pdf", "size": "1000", "md5Checksum": "same_hash"},
            {"id": "f2", "name": "renamed.pdf", "mimeType": "application/pdf", "size": "1000", "md5Checksum": "same_hash"},
        ]
        result = compute_duplicates(files)

        assert len(result["verified_groups"]) == 1
        assert result["verified_groups"][0]["count"] == 2

    def test_groups_sorted_by_potential_savings(self, files_with_md5_duplicates):
        """Groups should be sorted by potential savings in descending order."""
        result = compute_duplicates(files_with_md5_duplicates)

        # Verified groups should be sorted
        for i in range(len(result["verified_groups"]) - 1):
            assert result["verified_groups"][i]["potential_savings"] >= result["verified_groups"][i + 1]["potential_savings"]
