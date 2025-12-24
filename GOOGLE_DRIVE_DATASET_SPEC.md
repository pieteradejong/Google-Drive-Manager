# Google Drive Dataset Specification

This document describes the complete data structure retrieved from the Google Drive API, including field definitions, sizes, and storage estimates.

---

## Overview

The Google Drive Manager retrieves and caches three primary datasets:

| Dataset | Size (Your Drive) | Records | Description |
|---------|-------------------|---------|-------------|
| Quick Scan | ~10 KB | 20 folders | Overview + top-level folders |
| Full Scan | ~46 MB | 86,576 files | Complete file/folder tree |
| Analytics Cache | ~8 MB | Derived | Pre-computed analytics |

**Your Drive Statistics:**
- Total files: 86,576 (15,001 folders + 71,575 files)
- Total storage used: 360.5 GB (in Drive), 133.8 GB quota used
- Total quota: 2.00 TB

---

## 1. Quick Scan Response

**Endpoint:** `GET /api/scan/quick`  
**Cache File:** `cache/quick_scan_cache.json` (~10 KB)  
**TTL:** 1 hour (server) + 5 minutes (client)

### Structure

```json
{
  "data": {
    "overview": { ... },
    "top_folders": [ ... ],
    "estimated_total_files": 1000
  },
  "metadata": { ... }
}
```

### overview (from `about.get` API)

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `total_quota` | string (bytes) | `"2203318222848"` | Total storage quota (2 TB) |
| `used` | string (bytes) | `"143648104345"` | Total used across all Google services |
| `used_in_drive` | string (bytes) | `"61072650857"` | Storage used in Drive only |
| `user_email` | string | `"user@gmail.com"` | Account email |
| `user_display_name` | string | `"Pieter"` | User's display name |

### top_folders (array of FileItem)

Only root-level folders (folders with 'root' as parent). See FileItem schema below.

---

## 2. Full Scan Response

**Endpoint:** `POST /api/scan/full/start` → `GET /api/scan/full/status/{scan_id}`  
**Cache File:** `cache/full_scan_cache.json` (~46 MB for ~86K files)  
**TTL:** 30 days initial + Drive API change detection (indefinite if unchanged)

### Structure

```json
{
  "data": {
    "files": [ ... ],
    "children_map": { ... },
    "stats": { ... }
  },
  "metadata": { ... }
}
```

### files (array of FileItem)

Every file and folder in the Drive. This is the largest component of the cache.

#### FileItem Schema

| Field | Type | Size (bytes) | Required | Description |
|-------|------|--------------|----------|-------------|
| `id` | string | ~33 | Yes | Unique file/folder ID |
| `name` | string | ~20-50 | Yes | File/folder name |
| `mimeType` | string | ~30-50 | Yes | MIME type (see below) |
| `size` | int/null | ~8 | No | File size in bytes (null for folders) |
| `calculatedSize` | int/null | ~8 | No | Computed folder size (sum of children) |
| `createdTime` | string | ~24 | No | ISO 8601 timestamp |
| `modifiedTime` | string | ~24 | No | ISO 8601 timestamp |
| `webViewLink` | string | ~80 | No | Google Drive URL |
| `parents` | string[] | ~35 | Yes | Array of parent folder IDs |

**Average size per FileItem:** ~376 bytes (JSON serialized)

#### Example FileItem (File)

```json
{
  "id": "19UMm5qP3SDmuCwReRFlkxz0zXvR9kf12",
  "name": "IMG_0686.jpeg",
  "mimeType": "image/jpeg",
  "size": 3565836,
  "calculatedSize": null,
  "createdTime": "2025-12-18T15:41:55.069Z",
  "modifiedTime": "2025-12-18T15:41:53.000Z",
  "webViewLink": "https://drive.google.com/file/d/19UMm5qP3SDmuCwReRFlkxz0zXvR9kf12/view?usp=drivesdk",
  "parents": ["1QSUAzjjGVkGWQssXunhUs5Aojb0D80oZ"]
}
```

#### Example FileItem (Folder)

```json
{
  "id": "1oraQOUWtC_imv2noBLLyIylfi1AEsBrd",
  "name": "Jan Life",
  "mimeType": "application/vnd.google-apps.folder",
  "size": null,
  "calculatedSize": 1048576000,
  "createdTime": "2025-12-18T15:46:44.323Z",
  "modifiedTime": "2025-12-18T15:46:44.323Z",
  "webViewLink": "https://drive.google.com/drive/folders/1oraQOUWtC_imv2noBLLyIylfi1AEsBrd",
  "parents": ["1a1Er9cQVePwkFSIYQGhck93WFE9jPcyg"]
}
```

### children_map

Maps parent folder IDs to arrays of child file/folder IDs. Used for tree traversal.

| Key | Value |
|-----|-------|
| Parent folder ID (string) | Array of child IDs (string[]) |

**Example:**
```json
{
  "1a1Er9cQVePwkFSIYQGhck93WFE9jPcyg": ["1oraQOUWtC_imv2noBLLyIylfi1AEsBrd", "19UMm5qP3SDmuCwReRFlkxz0zXvR9kf12"],
  "0AHTI1es55md1Uk9PVA": ["15Iw-Cm1oOXBihObxY7aWpDHmTn62kArT", "1Y524L01mAYZDaIdCL9FNXvlHghko7vAC"]
}
```

**Size:** ~14,172 entries (one per folder with children)

### stats (DriveStats)

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `total_files` | int | `86576` | Total items (files + folders) |
| `total_size` | int | `387179015006` | Total bytes (360.5 GB) |
| `folder_count` | int | `15001` | Number of folders |
| `file_count` | int | `71575` | Number of files (non-folders) |

---

## 3. Cache Metadata

Both quick scan and full scan caches include metadata for validation.

### CacheMetadata Schema

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `timestamp` | string | `"2025-12-18T23:56:23.500839+00:00"` | When cache was created |
| `file_count` | int | `86576` | Number of files at cache time |
| `total_size` | int | `387179015006` | Total size at cache time |
| `last_modified` | string/null | `null` | Most recent file modification (if tracked) |
| `cache_version` | int | `1` | Version for format changes |
| `validated_count` | int | `0` | Times cache was validated still-valid |

---

## 4. Derived Analytics Cache

**Cache File:** `cache/full_scan_analytics_cache.json` (~8 MB)  
**Computed from:** Full scan cache  
**Recomputes when:** Full scan cache changes

### Analytics Data Structure

```json
{
  "data": {
    "derived_version": 2,
    "duplicates": { ... },
    "depths": { ... },
    "semantic": { ... },
    "age_semantic": { ... },
    "type_semantic": { ... },
    "orphans": { ... },
    "types": { ... },
    "timeline": { ... },
    "large": { ... }
  },
  "metadata": { ... }
}
```

### Analytics Views

| View | Description | Key Fields |
|------|-------------|------------|
| `duplicates` | Files with same name+size | `groups`, `total_potential_savings` |
| `depths` | Folder depth analysis | `depth_by_id`, `distribution`, `max_depth`, `deepest_folder_ids` |
| `semantic` | Folder categories (Work, Personal, Photos, etc.) | `folder_category`, `totals`, `category_folder_ids` |
| `age_semantic` | Files grouped by age bucket | `buckets`, `matrix` |
| `type_semantic` | Files grouped by MIME category | `groups`, `matrix` |
| `orphans` | Files with missing parents | `orphans`, `count` |
| `types` | MIME type distribution | `groups` |
| `timeline` | Activity over time | `created`, `modified` |
| `large` | Largest files/folders | `top_file_ids`, `top_folder_ids` |

### AnalyticsCacheMetadata

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `computed_at` | string | `"2025-12-18T23:56:25.116654+00:00"` | When analytics were computed |
| `source_scan_type` | string | `"full_scan"` | Source cache type |
| `source_cache_timestamp` | string | `"2025-12-18T23:56:23.500839+00:00"` | Source cache timestamp |
| `source_cache_version` | int | `1` | Source cache version |
| `source_file_count` | int | `86576` | File count at computation |
| `source_total_size` | int | `387179015006` | Total size at computation |
| `derived_version` | int | `2` | Analytics structure version |
| `timings_ms` | object | `{"analytics.total": 688.96}` | Computation timings |

---

## 5. MIME Type Distribution

Based on your Drive (86,576 items):

| Count | MIME Type | Category |
|-------|-----------|----------|
| 15,001 | `application/vnd.google-apps.folder` | Folders |
| 11,497 | `image/jpeg` | Images |
| 10,987 | `application/octet-stream` | Binary/Unknown |
| 9,762 | `application/x-javascript` | Code |
| 6,643 | `image/png` | Images |
| 4,040 | `text/x-python` | Code |
| 3,926 | `application/x-python-code` | Code |
| 3,839 | `text/javascript` | Code |
| 3,047 | `text/x-chdr` | Code (C headers) |
| 2,181 | `application/xml` | Data |
| 1,913 | `text/html` | Web |
| 1,693 | `image/heif` | Images |
| 1,342 | `application/json` | Data |
| 1,309 | `text/x-markdown` | Docs |
| 1,308 | `application/vnd.google-apps.document` | Google Docs |

### Google Workspace MIME Types

| MIME Type | Description |
|-----------|-------------|
| `application/vnd.google-apps.folder` | Folder |
| `application/vnd.google-apps.document` | Google Doc |
| `application/vnd.google-apps.spreadsheet` | Google Sheet |
| `application/vnd.google-apps.presentation` | Google Slides |
| `application/vnd.google-apps.form` | Google Form |
| `application/vnd.google-apps.drawing` | Google Drawing |
| `application/vnd.google-apps.shortcut` | Shortcut to file |

---

## 6. Size Estimation Formula

For estimating cache size based on file count:

```
Cache Size (MB) ≈ (file_count × 376 bytes) / 1,048,576
                + (folder_count × 50 bytes) / 1,048,576  [children_map]
                + 1 KB  [stats + metadata]
```

**Examples:**
| Files | Estimated Cache Size |
|-------|---------------------|
| 10,000 | ~4 MB |
| 50,000 | ~19 MB |
| 100,000 | ~38 MB |
| 500,000 | ~190 MB |

---

## 7. API Fields Retrieved

The app requests these fields from the Google Drive API:

```python
fields = "files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink)"
```

### Fields NOT Retrieved (Available in API)

| Field | Description | Why Not Used |
|-------|-------------|--------------|
| `owners` | File owner(s) | Privacy, adds ~50 bytes/file |
| `shared` | Is file shared | Privacy concerns |
| `sharingUser` | Who shared with you | Privacy |
| `permissions` | All permissions | Very large, separate API |
| `thumbnailLink` | Preview image URL | Expires, not cacheable |
| `description` | File description | Rarely used |
| `starred` | Is file starred | Personal preference |
| `trashed` | Is in trash | We filter `trashed=false` |
| `md5Checksum` | File hash | Only for binary files |
| `contentHints` | Indexing hints | Not useful for viz |
| `viewedByMe` | Has been viewed | Privacy |
| `viewedByMeTime` | When last viewed | Privacy |

---

## 8. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Google Drive API                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Backend (FastAPI)                                                       │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐  │
│  │   Quick Scan    │    │    Full Scan    │    │  Analytics Compute  │  │
│  │   about.get()   │    │  files.list()   │    │   (from full scan)  │  │
│  │   + root query  │    │   all pages     │    │                     │  │
│  └────────┬────────┘    └────────┬────────┘    └──────────┬──────────┘  │
│           │                      │                        │              │
│           ▼                      ▼                        ▼              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                        Cache Layer                               │    │
│  │  quick_scan_cache.json  full_scan_cache.json  analytics_cache   │    │
│  │        (~10 KB)             (~46 MB)              (~8 MB)        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Frontend (React + TanStack Query)                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     TanStack Query Cache                          │   │
│  │   quickScan: 5min staleTime    fullScanResult: 30min gcTime      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Visualization Components                     │   │
│  │   DAG View, Treemap, Timeline, Semantic, Size Grid, etc.        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Cache Validation Strategy

### Quick Scan
1. Check if cache exists
2. Check if cache age < 1 hour (TTL)
3. If valid → return cached data
4. If invalid → fetch fresh data, save to cache

### Full Scan
1. Check if cache exists
2. Check if cache age < 30 days (initial TTL)
3. If within TTL → return cached data
4. If past TTL → query Drive API for recently modified files:
   - `modifiedTime > cache_timestamp` (single API call)
   - If NO files modified → cache still valid (extends indefinitely)
   - If files modified → cache invalid, trigger rescan

**Key Insight:** For drives that rarely change, the full scan cache can remain valid indefinitely. Only when files are actually modified does the cache invalidate.

---

## 10. Performance Characteristics

| Operation | Typical Time | Notes |
|-----------|-------------|-------|
| Quick Scan (fresh) | ~1-2s | 2 API calls |
| Quick Scan (cached) | <50ms | Local file read |
| Full Scan (fresh, 86K files) | ~5-10s | ~87 API pages |
| Full Scan (cached) | ~500ms | 46 MB file read |
| Cache validation (Drive check) | ~200ms | 1 API call |
| Analytics compute | ~700ms | From cached data |

---

## 11. Storage Impact

| Component | Size | Growth Rate |
|-----------|------|-------------|
| Full scan cache | ~0.5 KB per file | Linear with file count |
| Analytics cache | ~10% of full scan | Proportional |
| Quick scan cache | ~10 KB fixed | Constant |

**Recommendation:** For Drives with >500K files, consider:
- Gzip compression (60-80% reduction)
- Incremental cache updates
- Pagination for client delivery
