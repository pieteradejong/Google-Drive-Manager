# Caching Strategy Implementation Plan

## Overview
Implement a hybrid caching strategy with server-side caching for full scans and client-side caching for quick scans, using Drive API's recently modified files check for smart cache invalidation.

## Design Decisions

### Cache Strategy
- **Quick Scan**: Client-side (TanStack Query) + Server-side in-memory (1 hour TTL)
- **Full Scan**: Server-side file-based cache (JSON) + Client-side (TanStack Query)
- **Cache Invalidation**: Hybrid approach using Drive API's `modifiedTime` check + time-based TTL

### Cache Location
- **Server-side**: 
  - Quick scan: In-memory dictionary with timestamp
  - Full scan: JSON file in `cache/` directory
- **Client-side**: 
  - TanStack Query cache (automatic)
  - Optional: localStorage for persistence across sessions

### Cache Metadata
Each cached result includes:
- `timestamp`: When cache was created
- `file_count`: Total files at cache time
- `total_size`: Total size at cache time
- `last_modified`: Most recent file modification time from Drive
- `cache_version`: Version number for cache format changes

## Implementation Plan

### Phase 1: Server-Side Caching Infrastructure

#### 1.1 Create cache utilities module
**File**: `backend/cache.py`
- `CacheMetadata` Pydantic model for cache metadata
- `get_cache_path()`: Get path to cache file
- `load_cache(scan_type: str)`: Load cached data if valid
- `save_cache(scan_type: str, data: Any, metadata: CacheMetadata)`: Save cache
- `is_cache_valid(metadata: CacheMetadata, max_age_seconds: int)`: Check if cache is still valid
- `get_cache_metadata()`: Get metadata from cache file

#### 1.2 Add recently modified files check
**File**: `backend/drive_api.py`
- New function: `check_recently_modified(service, since_timestamp: datetime, limit: int = 10) -> List[Dict]`
  - Query Drive API: `orderBy="modifiedTime desc"` with `modifiedTime > since_timestamp`
  - Returns list of recently modified files
  - Used to determine if cache is stale

#### 1.3 Update quick scan endpoint with caching
**File**: `backend/main.py`
- Check cache before scanning
- If cache valid: return cached data
- If cache invalid/missing: scan, cache result, return data
- Cache key: `quick_scan`
- TTL: 1 hour (3600 seconds)

#### 1.4 Update full scan with caching
**File**: `backend/main.py`
- Before starting scan: check if valid cache exists
- If valid cache: return cached result immediately (skip background scan)
- If invalid/missing: proceed with background scan
- After scan completes: save to cache file
- Cache key: `full_scan`
- TTL: 7 days (604800 seconds) OR until Drive changes detected

#### 1.5 Add cache invalidation endpoint
**File**: `backend/main.py`
- `DELETE /api/cache` or `POST /api/cache/invalidate`
- Clears both quick and full scan caches
- Useful for manual refresh

### Phase 2: Smart Cache Invalidation

#### 2.1 Implement cache validation logic
**File**: `backend/cache.py`
- `validate_cache_with_drive(service, cache_metadata: CacheMetadata) -> bool`
  - Check if cache timestamp is within TTL
  - Query Drive API for files modified since cache timestamp
  - If any files modified: cache is invalid
  - If no files modified: cache is still valid (even if past TTL)
  - Return True if valid, False if invalid

#### 2.2 Integrate validation into scan endpoints
- Quick scan: Simple time-based check (1 hour)
- Full scan: Time-based (7 days) + Drive API check for changes
- If Drive check fails (API error): fall back to time-based only

### Phase 3: Client-Side Caching with TanStack Query

#### 3.1 Set up TanStack Query
**File**: `frontend/src/App.tsx` or `frontend/src/main.tsx`
- Wrap app with `QueryClientProvider`
- Configure `QueryClient` with default options:
  - `staleTime`: 5 minutes for quick scan, 30 minutes for full scan
  - `cacheTime`: 1 hour
  - `refetchOnWindowFocus`: false (for better UX)

#### 3.2 Update useQuickScan hook
**File**: `frontend/src/hooks/useQuickScan.ts`
- Replace manual state with `useQuery` from TanStack Query
- Query key: `['quickScan']`
- Automatic caching, refetching, and error handling

#### 3.3 Update useFullScan hook
**File**: `frontend/src/hooks/useFullScan.ts`
- Use `useMutation` for starting scan
- Use `useQuery` for polling status (with automatic caching)
- Query key: `['fullScan', scanId]`
- Cache full scan result when complete

#### 3.4 Add cache status indicators
**File**: `frontend/src/components/DriveVisualizer.tsx`
- Show "Last updated: X minutes ago" badge
- Show "Cached" indicator when showing cached data
- Add "Refresh" button to force cache invalidation

### Phase 4: Cache File Management

#### 4.1 Cache file structure
**Location**: `cache/drive_scan_cache.json`
**Format**:
```json
{
  "quick_scan": {
    "data": { ... },
    "metadata": {
      "timestamp": "2024-01-15T10:30:00Z",
      "file_count": 1000,
      "total_size": 5368709120,
      "last_modified": "2024-01-15T09:00:00Z",
      "cache_version": 1
    }
  },
  "full_scan": {
    "data": { ... },
    "metadata": { ... }
  }
}
```

#### 4.2 Add cache cleanup
**File**: `backend/cache.py`
- `cleanup_old_caches()`: Remove caches older than max TTL
- Run on startup or periodically
- Or add to `reset.sh` script

#### 4.3 Update .gitignore
- Add `cache/` directory to `.gitignore`
- Cache files should not be committed

### Phase 5: Testing and Edge Cases

#### 5.1 Test scenarios
- Cache hit: Verify cached data is returned
- Cache miss: Verify scan runs and cache is saved
- Cache invalidation: Verify Drive API check works
- Cache corruption: Handle invalid JSON gracefully
- API errors: Fall back to time-based validation
- Empty Drive: Handle gracefully

#### 5.2 Error handling
- If cache file is corrupted: delete and rescan
- If Drive API check fails: use time-based validation
- If cache write fails: log error but don't fail request
- If cache read fails: proceed with fresh scan

## File Changes Summary

### New Files
- `backend/cache.py`: Cache utilities and metadata models
- `cache/drive_scan_cache.json`: Cache storage (gitignored)

### Modified Files
- `backend/drive_api.py`: Add `check_recently_modified()` function
- `backend/main.py`: 
  - Add cache checks to scan endpoints
  - Add cache invalidation endpoint
  - Update full scan to use cache
- `backend/models.py`: Add `CacheMetadata` model
- `frontend/src/App.tsx` or `frontend/src/main.tsx`: Add TanStack Query setup
- `frontend/src/hooks/useQuickScan.ts`: Migrate to TanStack Query
- `frontend/src/hooks/useFullScan.ts`: Migrate to TanStack Query
- `frontend/src/components/DriveVisualizer.tsx`: Add cache status indicators
- `.gitignore`: Add `cache/` directory

## Configuration

### Environment Variables (Optional)
- `CACHE_TTL_QUICK_SECONDS`: Quick scan cache TTL (default: 3600)
- `CACHE_TTL_FULL_SECONDS`: Full scan cache TTL (default: 604800)
- `CACHE_DIR`: Cache directory path (default: `cache/`)

## Benefits
- **Performance**: Instant results for cached scans
- **Cost**: Fewer Drive API calls
- **UX**: Faster load times, better perceived performance
- **Smart**: Only invalidates when Drive actually changes
- **Resilient**: Falls back gracefully on errors

## Future Enhancements
- Incremental cache updates (only fetch changed files)
- Cache compression for large datasets
- Cache statistics/metrics endpoint
- Background cache warming
- Multi-user support (when needed)
