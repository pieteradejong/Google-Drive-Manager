# Duplicate Detection Strategy

This document describes the strategy for **reliably identifying duplicate files** in Google Drive, including the technical approach, API fields required, and implementation details.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Problem with Current Approach](#the-problem-with-current-approach)
3. [Understanding Google Drive File Types](#understanding-google-drive-file-types)
4. [The Solution: Cryptographic Checksums](#the-solution-cryptographic-checksums)
5. [API Fields Reference](#api-fields-reference)
6. [Implementation Details](#implementation-details)
7. [Edge Cases and Limitations](#edge-cases-and-limitations)
8. [Storage Impact Analysis](#storage-impact-analysis)
9. [Future Enhancements](#future-enhancements)

---

## Executive Summary

**Goal**: Provide a 100% reliable way to identify when two files in Google Drive are truly identical (same content) and occupy separate physical storage.

**Solution**: Use the `md5Checksum` field from the Google Drive API. Files with identical checksums are cryptographically proven to have identical content.

**Key Insight**: Google Drive has three fundamentally different file types that require different handling:

| File Type | Has Checksum | Detection Method | Confidence |
|-----------|--------------|------------------|------------|
| Binary files (images, PDFs, videos) | ✅ Yes | `md5Checksum` match | 100% verified |
| Google Workspace (Docs, Sheets) | ❌ No | Name + metadata heuristic | Low confidence |
| Shortcuts | ❌ No | Excluded (not duplicates) | N/A |

---

## The Problem with Current Approach

The current duplicate detection in [`backend/analytics.py`](backend/analytics.py) uses **name + size** matching:

```python
# Current approach (UNRELIABLE)
key = (name, size)
groups.setdefault(key, []).append(f)
```

### Why This Fails

1. **False Positives**: Two completely different files can have the same name and size
   - Example: Two different photos both named `IMG_0001.jpg` at 3.5 MB
   - Example: Two different PDFs both named `report.pdf` at exactly 1,024,000 bytes

2. **False Negatives**: Identical files with different names are missed
   - Example: Same photo saved as `vacation.jpg` and `beach_photo.jpg`
   - Example: Same document copied with `(1)` suffix

3. **No Content Verification**: Without comparing actual content, we're just guessing

---

## Understanding Google Drive File Types

### 1. Binary Files (Uploaded Files)

These are actual files uploaded to Google Drive with real binary content stored on Google's servers.

**Examples**:
- Images: `image/jpeg`, `image/png`, `image/gif`, `image/heif`
- Documents: `application/pdf`, `application/msword`
- Videos: `video/mp4`, `video/quicktime`
- Audio: `audio/mpeg`, `audio/wav`
- Archives: `application/zip`, `application/x-tar`
- Code: `text/plain`, `application/javascript`, `text/x-python`

**Key Properties**:
- Have actual `size` in bytes
- Have `md5Checksum` (32-character hex string)
- Content is stored as-is on Google's servers

### 2. Google Workspace Files (Native Files)

These are files created in Google's native formats. They are **not stored as binary files** but as structured data in Google's database.

**MIME Types**:
- `application/vnd.google-apps.document` (Google Docs)
- `application/vnd.google-apps.spreadsheet` (Google Sheets)
- `application/vnd.google-apps.presentation` (Google Slides)
- `application/vnd.google-apps.form` (Google Forms)
- `application/vnd.google-apps.drawing` (Google Drawings)

**Key Properties**:
- Size is reported as `0` or `null` (they don't consume quota)
- **NO `md5Checksum`** available (no binary content to hash)
- Cannot reliably detect duplicates

### 3. Shortcuts

Introduced in September 2020 when Google removed multi-parent support. A shortcut is a **reference** to another file, not a copy.

**MIME Type**: `application/vnd.google-apps.shortcut`

**Key Properties**:
- Has `shortcutDetails.targetId` pointing to the actual file
- Has `shortcutDetails.targetMimeType` with the target's type
- Size is negligible (just metadata)
- **NOT a duplicate** - it's a reference, not a copy
- Must be excluded from duplicate analysis

---

## The Solution: Cryptographic Checksums

### What is md5Checksum?

The `md5Checksum` field contains a 32-character hexadecimal string representing the MD5 hash of the file's content.

**Example**: `d41d8cd98f00b204e9800998ecf8427e`

### How MD5 Works

```
File Content → MD5 Algorithm → 128-bit Hash → 32 Hex Characters
```

- **Deterministic**: Same content always produces same hash
- **Collision-resistant**: Different content produces different hashes (with extremely high probability)
- **One-way**: Cannot reverse the hash to get content

### Reliability Guarantee

If two files have the **same md5Checksum**, they are:
- Byte-for-byte identical
- True duplicates that consume double the storage
- Safe to delete one copy without losing data

The probability of two different files having the same MD5 hash (collision) is approximately 1 in 2^128, which is effectively zero for practical purposes.

---

## API Fields Reference

### Fields Currently Fetched

```python
fields = "files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink)"
```

### Fields to Add

```python
fields = "files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink, md5Checksum, shortcutDetails)"
```

### Field Definitions

| Field | Type | Description | Available For |
|-------|------|-------------|---------------|
| `md5Checksum` | string | MD5 hash of file content | Binary files only |
| `shortcutDetails` | object | Shortcut target info | Shortcuts only |
| `shortcutDetails.targetId` | string | ID of target file/folder | Shortcuts only |
| `shortcutDetails.targetMimeType` | string | MIME type of target | Shortcuts only |

### Additional Hash Fields (Optional)

Google Drive also provides stronger hashes if needed:

| Field | Hash Size | Notes |
|-------|-----------|-------|
| `md5Checksum` | 128 bits | Fast, sufficient for dedup |
| `sha1Checksum` | 160 bits | More secure |
| `sha256Checksum` | 256 bits | Most secure, largest |

For duplicate detection, MD5 is sufficient and smallest.

---

## Implementation Details

### Backend Changes

#### 1. Update API Fields (`backend/drive_api.py`)

**Location**: `list_all_files()` function, line ~32

```python
# BEFORE
fields="nextPageToken, files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink)"

# AFTER
fields="nextPageToken, files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink, md5Checksum, shortcutDetails)"
```

Also update in `get_top_level_folders()` for consistency.

#### 2. Update Pydantic Models (`backend/models.py`)

```python
from typing import Optional

class ShortcutDetails(BaseModel):
    targetId: str
    targetMimeType: Optional[str] = None

class FileItem(BaseModel):
    id: str
    name: str
    mimeType: str
    parents: List[str] = []
    size: Optional[int] = None
    calculatedSize: Optional[int] = None
    createdTime: Optional[str] = None
    modifiedTime: Optional[str] = None
    webViewLink: Optional[str] = None
    # NEW FIELDS
    md5Checksum: Optional[str] = None  # Only for binary files
    shortcutDetails: Optional[ShortcutDetails] = None  # Only for shortcuts
```

#### 3. Update Analytics (`backend/analytics.py`)

Replace `compute_duplicates()` with a new implementation:

```python
SHORTCUT_MIME = "application/vnd.google-apps.shortcut"
WORKSPACE_MIMES = {
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
    "application/vnd.google-apps.form",
    "application/vnd.google-apps.drawing",
}

def compute_duplicates(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect duplicate files using md5Checksum (verified) or name+size (heuristic).
    
    Returns:
        - verified_groups: Files with identical md5Checksum (100% duplicates)
        - potential_groups: Files with same name+size but no checksum (Workspace files)
    """
    # Exclude folders and shortcuts
    candidates = [
        f for f in files 
        if not _is_folder(f) and f.get("mimeType") != SHORTCUT_MIME
    ]
    
    # Group by md5Checksum (for binary files)
    checksum_groups: Dict[str, List[Dict]] = {}
    # Group by name+size (fallback for Workspace files)
    heuristic_groups: Dict[Tuple[str, int], List[Dict]] = {}
    
    for f in candidates:
        checksum = f.get("md5Checksum")
        
        if checksum:
            # Binary file with checksum - use verified grouping
            checksum_groups.setdefault(checksum, []).append(f)
        else:
            # Workspace file - use heuristic grouping
            name = f.get("name") or ""
            size = _safe_int(f.get("size") or 0)
            key = (name, size)
            heuristic_groups.setdefault(key, []).append(f)
    
    # Build output groups
    verified = []
    for checksum, flist in checksum_groups.items():
        if len(flist) < 2:
            continue
        size = _safe_int(flist[0].get("size") or 0)
        verified.append({
            "checksum": checksum,
            "name": flist[0].get("name"),  # Representative name
            "size": size,
            "file_ids": [f["id"] for f in flist],
            "count": len(flist),
            "potential_savings": (len(flist) - 1) * size,
            "confidence": "verified",
            "mimeType": flist[0].get("mimeType"),
        })
    
    potential = []
    for (name, size), flist in heuristic_groups.items():
        if len(flist) < 2:
            continue
        potential.append({
            "name": name,
            "size": size,
            "file_ids": [f["id"] for f in flist],
            "count": len(flist),
            "potential_savings": (len(flist) - 1) * size,
            "confidence": "potential",
            "mimeType": flist[0].get("mimeType"),
        })
    
    # Sort by potential savings
    verified.sort(key=lambda g: g["potential_savings"], reverse=True)
    potential.sort(key=lambda g: g["potential_savings"], reverse=True)
    
    total_verified_savings = sum(g["potential_savings"] for g in verified)
    total_potential_savings = sum(g["potential_savings"] for g in potential)
    
    return {
        "verified_groups": verified,
        "potential_groups": potential,
        "total_verified_savings": total_verified_savings,
        "total_potential_savings": total_potential_savings,
        # Legacy field for backward compatibility
        "groups": verified + potential,
        "total_savings": total_verified_savings + total_potential_savings,
    }
```

### Frontend Changes

#### 1. Update TypeScript Types (`frontend/src/types/drive.ts`)

```typescript
export interface ShortcutDetails {
  targetId: string;
  targetMimeType?: string;
}

export interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  size?: number | null;
  calculatedSize?: number | null;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  // NEW FIELDS
  md5Checksum?: string;
  shortcutDetails?: ShortcutDetails;
}
```

#### 2. Update Duplicate Finder View

Update `DuplicateFinderView.tsx` to display confidence levels:

```tsx
// Badge component for confidence level
const ConfidenceBadge = ({ confidence }: { confidence: string }) => {
  if (confidence === 'verified') {
    return (
      <span className="flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
        <CheckCircle2 size={12} />
        Verified Duplicate
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
      <AlertTriangle size={12} />
      Potential Duplicate
    </span>
  );
};
```

Display separate sections for verified vs potential duplicates, with clear explanations.

---

## Edge Cases and Limitations

### 1. Google Workspace Files Cannot Be Verified

**Problem**: Google Docs, Sheets, Slides don't have checksums.

**Mitigation**: 
- Show these as "Potential Duplicates" with clear warning
- User must manually verify these
- Consider adding an "Export & Compare" feature in the future

### 2. Renamed Duplicates Are Detected

**Benefit**: Unlike name-based matching, checksum matching finds duplicates regardless of filename.

**Example**: `photo.jpg` and `photo_backup.jpg` with same content will be grouped together.

### 3. Empty Files All Match

**Situation**: All empty files (0 bytes) have the same MD5 checksum: `d41d8cd98f00b204e9800998ecf8427e`

**Handling**: This is technically correct - all empty files ARE identical. Consider filtering out 0-byte files or marking them specially.

### 4. Shortcuts Are References, Not Duplicates

**Key Point**: A shortcut pointing to a file does NOT consume additional storage.

**Handling**: Always exclude shortcuts (mimeType = `application/vnd.google-apps.shortcut`) from duplicate analysis.

### 5. Files in Trash

**Current Behavior**: We filter `trashed=false`, so trashed files aren't included.

**Note**: This is correct - duplicates in trash don't affect active storage.

---

## Storage Impact Analysis

### Additional Cache Size

| Field | Size per File | For 71K Binary Files |
|-------|---------------|----------------------|
| `md5Checksum` | ~34 bytes (32 chars + quotes) | ~2.4 MB |
| `shortcutDetails` | ~60 bytes (when present) | Minimal (few shortcuts) |

**Total Additional Size**: ~2.5 MB (5% increase to 46 MB cache)

### Performance Impact

- **API Calls**: No additional calls (fields added to existing request)
- **Compute Time**: Grouping by checksum is O(n), same as name+size
- **Network**: Slightly larger response (~3% increase)

---

## Future Enhancements

### 1. Content-Based Deduplication Actions

- "Delete all but one" with verified confidence
- Automatic keep-newest/keep-oldest policies
- Batch operations for cleanup

### 2. Near-Duplicate Detection

- For images: perceptual hashing (similar but not identical images)
- For documents: text similarity analysis

### 3. Cross-Drive Duplicate Detection

- Compare files across shared drives
- Identify duplicates between personal and team drives

### 4. Export & Compare for Workspace Files

- Export Google Docs as PDF/DOCX
- Compute hash of exported content
- Compare across exports (expensive but more reliable)

---

## Appendix: ROADMAP - DAG Data Extraction and Caching

**Goal**: Extract and cache all relevant metrics and data to fully represent the Google Drive structure as a Directed Acyclic Graph (DAG), enabling rich offline analysis.

### Why a DAG?

Google Drive's structure is not a simple tree:
- Files can have multiple parents (legacy, pre-2020)
- Shortcuts create cross-references
- Shared files appear in multiple locations
- Orphaned files exist without valid parents

A DAG properly represents all these relationships.

### Fields to Extract for Complete DAG Representation

```python
# Comprehensive fields for DAG cache
fields = """
files(
  id,
  name,
  mimeType,
  parents,
  size,
  createdTime,
  modifiedTime,
  webViewLink,
  md5Checksum,
  shortcutDetails,
  owners,
  shared,
  capabilities
)
"""
```

### Proposed DAG Cache Structure

```json
{
  "version": 1,
  "created_at": "2025-12-22T...",
  
  "nodes": {
    "file_id_1": {
      "id": "...",
      "name": "...",
      "mimeType": "...",
      "size": 12345,
      "md5Checksum": "...",
      "metadata": { ... }
    }
  },
  
  "edges": {
    "hierarchy": [
      { "parent": "folder_id", "child": "file_id" }
    ],
    "shortcuts": [
      { "shortcut": "shortcut_id", "target": "target_id" }
    ],
    "duplicates": [
      { "checksum": "abc123", "files": ["id1", "id2", "id3"] }
    ]
  },
  
  "computed": {
    "depths": { "file_id": 3 },
    "sizes": { "folder_id": 1234567890 },
    "roots": ["root_folder_id"],
    "orphans": ["orphan_id_1", "orphan_id_2"],
    "topological_order": ["id1", "id2", ...]
  }
}
```

### Benefits of DAG Cache

1. **Offline Analysis**: All relationships pre-computed
2. **Visualization**: Render any view without re-computation
3. **Consistency**: Single source of truth for graph structure
4. **Performance**: O(1) lookups for relationships
5. **Extensibility**: Add new edge types (sharing, ownership) easily

---

## References

- [Google Drive API v3 - Files Resource](https://developers.google.com/drive/api/reference/rest/v3/files)
- [Google Drive API - Shortcuts Guide](https://developers.google.com/drive/api/guides/shortcuts)
- [Single Parent Enforcement (Sept 2020)](https://developers.google.com/drive/api/guides/folder)
