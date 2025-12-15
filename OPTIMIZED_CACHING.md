# Optimized Caching Strategy for Rarely-Changing Drives

## Overview

This caching strategy is optimized for Google Drives where files rarely change (e.g., only ~12 items change per week). The goal is to make scans almost never necessary by extending cache validity based on actual Drive changes rather than arbitrary time windows.

## Key Optimizations

### 1. Extended Initial TTL Windows

- **Quick Scan**: 7 days initial TTL (was 1 hour)
- **Full Scan**: 30 days initial TTL (was 7 days)
- After TTL expires, cache validity is extended based on actual Drive changes

### 2. Smart Cache Validation

Instead of invalidating cache after a fixed time, we:

1. **Check if cache is within TTL** (fast path - no API call)
2. **If past TTL, query Drive API** to see if ANY files were modified since cache time
3. **If no files changed**: Cache remains valid (can persist indefinitely)
4. **If files changed**: Cache is invalidated and fresh scan is triggered

### 3. Efficient Change Detection

- Only **1 API call** needed to check for changes
- Uses `pageSize=1` since we only need to know if ANY file changed
- Queries: `modifiedTime > cache_timestamp` ordered by `modifiedTime desc`
- Minimal fields requested for speed

### 4. Cache Persistence

Since files rarely change:
- Cache can persist for **weeks or months** until files actually change
- No need for periodic rescans "just in case"
- Scans only happen when Drive actually has changes

## How It Works

### Quick Scan Cache Flow

```
1. Request quick scan
2. Check cache exists?
   ├─ No → Run scan, cache result, return
   └─ Yes → Check cache age
       ├─ < 7 days → Return cached data (instant)
       └─ ≥ 7 days → Check Drive API for changes (1 API call)
           ├─ No changes → Cache valid, return cached data (instant)
           └─ Changes found → Invalidate cache, run scan, cache result
```

### Full Scan Cache Flow

```
1. Request full scan
2. Check cache exists?
   ├─ No → Start background scan, return scan_id
   └─ Yes → Check cache age
       ├─ < 30 days → Return cached data (instant)
       └─ ≥ 30 days → Check Drive API for changes (1 API call)
           ├─ No changes → Cache valid, return cached data (instant)
           └─ Changes found → Invalidate cache, start background scan
```

## Benefits

### For Rarely-Changing Drives

- **Almost no scans needed**: Cache persists until files actually change
- **Fast responses**: Instant results from cache (no API calls for unchanged data)
- **Minimal API usage**: Only 1 API call to check for changes (instead of scanning thousands of files)
- **Cost efficient**: Fewer API quota usage

### For Frequently-Changing Drives

- **Still works**: Cache invalidates when files change
- **No extra overhead**: Just one additional API call to check for changes
- **Graceful degradation**: Falls back to time-based validation if API check fails

## Example Timeline

### Scenario: Drive with 10 files changed in a week

```
Day 0: Full scan runs, cache saved
Day 1-29: Cache valid (within 30-day TTL) → Instant results, no scans
Day 30: TTL expires, checks Drive API → No changes found → Cache still valid
Day 31-60: Cache valid (Drive unchanged) → Instant results, no scans
Day 61: Checks Drive API → Finds 5 files changed → Cache invalidated, fresh scan
Day 62-91: New cache valid (within 30-day TTL) → Instant results
```

**Result**: Only 2 scans needed in 3 months (Day 0 and Day 61) instead of ~13 scans if using 7-day TTL.

## Implementation Details

### Cache Validation Function

```python
def validate_cache_with_drive(service, cache_metadata, max_age_seconds=2592000):
    # 1. Fast path: Check if within TTL (no API call)
    if is_cache_valid_time_based(cache_metadata, max_age_seconds):
        return True
    
    # 2. Slow path: Check if Drive actually changed (1 API call)
    cache_time = parse_timestamp(cache_metadata.timestamp)
    recently_modified = check_recently_modified(service, cache_time, limit=1)
    
    # 3. If no changes, cache is still valid (extends indefinitely)
    return len(recently_modified) == 0
```

### Drive API Query

```python
# Only checks if ANY file changed since cache time
results = service.files().list(
    q=f"trashed=false and modifiedTime > '{cache_timestamp}'",
    orderBy="modifiedTime desc",
    pageSize=1,  # Only need 1 result to know if anything changed
    fields="files(id)"  # Minimal fields for speed
).execute()
```

## Performance Metrics

### Before Optimization
- **Cache TTL**: 1 hour (quick), 7 days (full)
- **Scans per week**: ~168 (quick), ~1 (full)
- **API calls**: ~168 for validation checks

### After Optimization
- **Cache TTL**: 7 days (quick), 30 days (full) + Drive change detection
- **Scans per week**: ~0-1 (only when files change)
- **API calls**: ~0-1 (only to check for changes)

## Monitoring

Cache validation is logged with:
- Cache age (in days)
- Whether Drive check was performed
- Whether cache was validated or invalidated
- Reason for invalidation (files changed vs. API error)

Look for logs like:
```
[INFO] [cache] Cache past TTL but Drive unchanged - cache still valid (cache age: 45 days)
[INFO] [cache] Cache invalidated: 3 file(s) modified since cache
```

## Future Enhancements

1. **Incremental updates**: Instead of full rescan, only fetch changed files and merge
2. **Cache statistics**: Track cache hit rate, average cache age
3. **Smart warming**: Pre-validate cache in background
4. **Per-folder caching**: Cache individual folder structures separately
