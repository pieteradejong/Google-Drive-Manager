# Caching Status Report

## ✅ Yes, We Are Caching!

The application uses a **hybrid caching strategy** with both server-side and client-side caching.

## Server-Side Caching (Backend)

### Cache Location
- **Directory**: `cache/` (in project root)
- **Files**:
  - `quick_scan_cache.json` - Quick scan results (~10 KB)
  - `full_scan_cache.json` - Full scan results (~46 MB in your case!)

### Quick Scan Caching
- **TTL**: 1 hour (3600 seconds)
- **Validation**: Time-based only
- **Location**: `cache/quick_scan_cache.json`
- **When cached**: After every quick scan completes
- **When used**: Before starting a new quick scan, checks cache first

### Full Scan Caching
- **TTL**: 7 days (604800 seconds) + Smart validation
- **Validation**: 
  1. First checks if cache is within 7-day TTL
  2. If past TTL, queries Drive API for recently modified files
  3. If no files modified since cache: cache is still valid (even if past TTL)
  4. If files modified: cache is invalidated
- **Location**: `cache/full_scan_cache.json`
- **When cached**: After every full scan completes
- **When used**: Before starting a new full scan, checks cache first

### Cache Invalidation
- **Automatic**: Based on TTL and Drive API changes
- **Manual**: `DELETE /api/cache` endpoint (or `DELETE /api/cache?scan_type=quick_scan` or `full_scan`)
- **UI**: "Refresh" buttons in the UI call the invalidation endpoint

## Client-Side Caching (Frontend)

### TanStack Query (React Query)
- **Provider**: Configured in `App.tsx`
- **Default options**:
  - `refetchOnWindowFocus: false` - Don't refetch when window regains focus
  - `retry: 1` - Retry failed requests once

### Quick Scan Cache
- **Query Key**: `['quickScan']`
- **staleTime**: 5 minutes - Data considered fresh for 5 minutes
- **cacheTime**: 1 hour - Data kept in memory for 1 hour
- **Behavior**: 
  - First request: Fetches from server
  - Within 5 minutes: Returns cached data immediately
  - After 5 minutes: Returns cached data but refetches in background
  - After 1 hour: Removed from cache

### Full Scan Cache
- **Query Keys**: 
  - `['fullScan', scanId]` - For scan progress polling
  - `['fullScanResult']` - For final scan results
- **staleTime**: 0 (always considered stale for polling)
- **cacheTime**: 30 minutes - Results kept in memory for 30 minutes
- **Behavior**:
  - Polls every 2 seconds while scanning
  - Caches final result when scan completes
  - Result available immediately on next visit (if within 30 minutes)

## Current Cache Status

Based on your cache directory:
- ✅ **Quick scan cache exists**: `quick_scan_cache.json` (10 KB)
- ✅ **Full scan cache exists**: `full_scan_cache.json` (46 MB)

The 46 MB full scan cache suggests you have a large Drive with many files!

## How Caching Works

### Quick Scan Flow
1. User clicks "Quick Scan"
2. **Backend checks cache** → If valid (< 1 hour old), returns cached data immediately
3. If cache invalid/missing → Performs scan → Saves to cache → Returns data
4. **Frontend** → TanStack Query caches the response for 5 minutes

### Full Scan Flow
1. User clicks "Full Scan"
2. **Backend checks cache** → If valid (within 7 days OR no Drive changes), returns cached data immediately
3. If cache invalid → Starts background scan → Saves to cache when complete
4. **Frontend** → TanStack Query caches progress and final result

## Cache Benefits

1. **Faster response times**: Cached results return instantly
2. **Reduced API calls**: Fewer requests to Google Drive API (rate limit protection)
3. **Better UX**: Users see data immediately, even if cache is slightly stale
4. **Smart invalidation**: Full scan cache stays valid if Drive hasn't changed (even past 7 days)

## Cache Management

### View Cache Status
- UI shows "Updated X ago" timestamps
- "Refresh" buttons available to manually invalidate

### Clear Cache
- **Via UI**: Click "Refresh" button
- **Via API**: `DELETE /api/cache` (clears all) or `DELETE /api/cache?scan_type=quick_scan`
- **Manually**: Delete files in `cache/` directory

### Cache Files
- **Location**: `cache/` directory (gitignored)
- **Format**: JSON files with `data` and `metadata` keys
- **Size**: Can be large for full scans (your 46 MB is normal for large Drives)

## Performance Impact

- **Initial load**: If cache exists, results appear instantly
- **Memory**: Client-side cache uses browser memory (cleared after cacheTime)
- **Disk**: Server-side cache uses disk space (your 46 MB is reasonable)

## Recommendations

1. ✅ **Current setup is good** - Hybrid caching works well
2. ⚠️ **Monitor cache size** - If full_scan_cache.json grows > 100 MB, consider:
   - Limiting cached file count
   - Compressing cache files
   - Implementing cache size limits
3. ✅ **Smart invalidation working** - Full scan cache validates against Drive changes
