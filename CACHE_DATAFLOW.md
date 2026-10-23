# Cache Dataflow Documentation

This document describes the dataflow and architecture of the full scan caching system, including how cached data is loaded, validated, and displayed to users.

## Overview

The caching system is designed to provide instant app startup by loading cached full scan data immediately, while handling staleness warnings and validation in the background. The system uses a two-stage approach:

1. **Fast Path**: Load cached data immediately without Drive API validation
2. **Background Validation**: Validate cache against Google Drive API when needed

## 1. App Startup Flow - Cache Loading Sequence

```mermaid
sequenceDiagram
    participant App as App Component
    participant Hook as useFullScan Hook
    participant API as API Client
    participant Backend as Backend API
    participant Cache as Cache Files
    participant Drive as Google Drive API
    participant UI as DriveVisualizer

    App->>Hook: Component mounts
    Hook->>API: getFullScanCacheStatus()
    API->>Backend: GET /api/scan/full/cache/status
    Backend->>Cache: Read metadata sidecar (fast)
    Cache-->>Backend: Metadata (timestamp, file_count, etc.)
    Backend->>Backend: Compute age_seconds, is_stale (7-day threshold)
    Backend-->>API: {exists: true, age_seconds: 123456, is_stale: true}
    API-->>Hook: CacheStatusResponse
    
    alt Cache exists
        Hook->>API: getCachedFullScan() (parallel, non-blocking)
        API->>Backend: GET /api/scan/full/cached
        Backend->>Cache: Load full cache JSON
        Cache-->>Backend: ScanResponse data
        Backend-->>API: ScanResponse (no validation)
        API-->>Hook: Cached data
        Hook->>UI: Set fullResult = cachedData
        UI->>UI: Display visualization immediately
        
        Note over Hook,Drive: Background validation (non-blocking)
        Hook->>API: validateFullScanCache() (if TTL expired)
        API->>Backend: GET /api/scan/full/cache/validate
        Backend->>Drive: Check for recently modified files
        Drive-->>Backend: Modified files list
        Backend->>Backend: Compare with cache timestamp
        Backend-->>API: Validation result
        API-->>Hook: ValidationStatus
        
        alt Drive changed
            Hook->>UI: Show red "Cache invalid" banner
        else Drive unchanged
            Hook->>UI: Keep showing cached data
        end
    else Cache missing
        Hook->>UI: Show "Run Full Scan" button
    end
    
    alt Cache is stale (>7 days)
        UI->>UI: Show amber "Cache is X days old" banner
    end
```

## 2. Cache Validation Strategy

```mermaid
flowchart TD
    Start[App Startup] --> CheckStatus[Check Cache Status<br/>GET /api/scan/full/cache/status]
    CheckStatus --> ReadMeta[Read Metadata Sidecar<br/>full_scan_cache.meta.json]
    ReadMeta --> ComputeAge[Compute age_seconds<br/>is_stale = age > 7 days]
    ComputeAge --> CheckTTL{TTL Valid?<br/>age < 30 days}
    
    CheckTTL -->|Yes| TTLFresh[TTL Fresh<br/>reason: ttl_fresh]
    CheckTTL -->|No| TTLExpired[TTL Expired<br/>reason: ttl_expired]
    
    TTLFresh --> LoadCache[Load Cache Data<br/>GET /api/scan/full/cached]
    TTLExpired --> LoadCache
    
    LoadCache --> ReturnData[Return ScanResponse<br/>No Drive API validation]
    ReturnData --> ShowUI[Show Visualization<br/>Immediately]
    
    TTLExpired --> BackgroundValidate[Background Validation<br/>GET /api/scan/full/cache/validate]
    BackgroundValidate --> DriveCheck[Check Google Drive API<br/>for recently modified files]
    
    DriveCheck --> HasChanges{Files Modified<br/>Since Cache?}
    HasChanges -->|Yes| InvalidCache[Cache Invalid<br/>Show red warning banner]
    HasChanges -->|No| ValidCache[Cache Still Valid<br/>Extend validity]
    
    ShowUI --> CheckStale{Cache Age<br/>> 7 days?}
    CheckStale -->|Yes| ShowStaleBanner[Show Amber Banner<br/>Cache is X days old]
    CheckStale -->|No| ShowNormalBanner[Show Blue Banner<br/>Using cached data]
    
    style TTLFresh fill:#e1f5e1
    style TTLExpired fill:#fff4e1
    style InvalidCache fill:#ffe1e1
    style ValidCache fill:#e1f5e1
    style ShowStaleBanner fill:#fff4e1
    style ShowNormalBanner fill:#e1f0ff
```

## 3. Frontend Hook State Management

```mermaid
stateDiagram-v2
    [*] --> CheckingStatus: App mounts
    
    CheckingStatus --> CacheExists: cacheStatus.exists = true
    CheckingStatus --> NoCache: cacheStatus.exists = false
    
    CacheExists --> LoadingCache: shouldFetchCachedFullScan = true
    LoadingCache --> DataLoaded: cachedData received
    
    DataLoaded --> ShowingCached: fullResult = cachedData
    ShowingCached --> CheckStaleness: Evaluate is_stale
    
    CheckStaleness --> ShowStaleWarning: is_stale = true<br/>(age > 7 days)
    CheckStaleness --> ShowNormalCache: is_stale = false<br/>(age <= 7 days)
    
    DataLoaded --> BackgroundValidation: shouldValidateCache = true<br/>(if TTL expired)
    BackgroundValidation --> ValidationComplete: validationStatus received
    
    ValidationComplete --> CacheInvalid: validationStatus.valid = false<br/>(Drive changed)
    ValidationComplete --> CacheValid: validationStatus.valid = true<br/>(Drive unchanged)
    
    CacheInvalid --> ShowInvalidWarning: Show red banner<br/>Prompt rescan
    CacheValid --> ShowNormalCache: Keep showing cached data
    
    NoCache --> ShowScanButton: Show "Run Full Scan" button
    
    ShowStaleWarning --> UserAction: User clicks "Refresh Scan"
    ShowInvalidWarning --> UserAction
    UserAction --> StartingScan: startFullScan()
    StartingScan --> Scanning: Scan in progress
    Scanning --> ScanComplete: Scan finished
    ScanComplete --> ShowingCached: Update with fresh data
    
    note right of ShowStaleWarning
        Amber banner:
        "Cache is X days old.
        Consider running a fresh scan."
    end note
    
    note right of ShowInvalidWarning
        Red banner:
        "Cache invalid - Drive has changed.
        Please run a new full scan."
    end note
```

## 4. Backend Endpoint Responsibilities

```mermaid
graph TB
    subgraph FastPath["Fast Path - No Drive API Calls"]
        StatusEndpoint["/api/scan/full/cache/status<br/>Returns: exists, age_seconds, is_stale<br/>Reads: metadata sidecar only<br/>Time: <10ms"]
        CachedEndpoint["/api/scan/full/cached<br/>Returns: ScanResponse<br/>Reads: full cache JSON<br/>Time: 50-200ms<br/>No validation"]
    end
    
    subgraph SlowPath["Slow Path - Drive API Validation"]
        ValidateEndpoint["/api/scan/full/cache/validate<br/>Returns: validated status<br/>Calls: Google Drive API<br/>Time: 500-2000ms<br/>Checks: recently modified files"]
    end
    
    subgraph CacheFiles["Cache Storage"]
        MetaFile["full_scan_cache.meta.json<br/>Small file ~1KB<br/>Contains: timestamp, file_count,<br/>total_size, cache_version"]
        DataFile["full_scan_cache.json<br/>Large file ~10-100MB<br/>Contains: files array,<br/>children_map, stats"]
    end
    
    subgraph Frontend["Frontend Components"]
        Hook["useFullScan Hook<br/>Manages cache state<br/>Computes staleness<br/>Triggers background validation"]
        Component["DriveVisualizer<br/>Displays warnings<br/>Shows cached data<br/>Handles user actions"]
    end
    
    StatusEndpoint --> MetaFile
    CachedEndpoint --> DataFile
    ValidateEndpoint --> MetaFile
    ValidateEndpoint --> DriveAPI["Google Drive API<br/>files.list with<br/>modifiedTime filter"]
    
    Hook --> StatusEndpoint
    Hook --> CachedEndpoint
    Hook --> ValidateEndpoint
    Hook --> Component
    
    Component --> StaleBanner["Amber Banner<br/>age > 7 days"]
    Component --> InvalidBanner["Red Banner<br/>Drive changed"]
    Component --> NormalBanner["Blue Banner<br/>Fresh cache"]
    
    style FastPath fill:#e1f5e1
    style SlowPath fill:#fff4e1
    style StaleBanner fill:#fff4e1
    style InvalidBanner fill:#ffe1e1
    style NormalBanner fill:#e1f0ff
```

## 5. Cache Age Thresholds

```mermaid
timeline
    title Cache Age Thresholds and Behavior
    
    section Fresh Cache
        0 days : Cache created
        0-7 days : Normal usage
                  : Blue banner
                  : No warnings
                  
    section Stale Cache
        7 days : Staleness threshold
        7-30 days : Amber warning banner
                  : "Cache is X days old"
                  : Still usable
                  
    section TTL Expired
        30 days : TTL threshold
        30+ days : Background validation starts
                 : Checks Drive for changes
                 : If unchanged: still valid
                 : If changed: red warning
```

## Key Design Decisions

### Instant Loading
- Cached data loads immediately without waiting for Drive API validation
- This ensures fast app startup even with large caches
- Validation happens in the background and doesn't block the UI

### Staleness Thresholds
- **7 days**: Staleness warning threshold - shows amber banner
- **30 days**: TTL threshold - triggers background validation
- Cache can remain valid indefinitely if Drive hasn't changed

### Two-Stage Validation
1. **Fast TTL check**: Based on cache age only (no API calls)
2. **Drive API validation**: Checks for actual file changes (slower, runs in background)

### Warning Banners
- **Blue**: Fresh cache (< 7 days old)
- **Amber**: Stale cache (> 7 days old) - informational warning
- **Red**: Invalid cache (Drive has changed) - requires rescan

## API Endpoints

### GET /api/scan/full/cache/status
- **Purpose**: Fast cache existence and staleness check
- **Reads**: Metadata sidecar file only (~1KB)
- **Returns**: `exists`, `age_seconds`, `is_stale`, `valid` (TTL-based)
- **Performance**: <10ms

### GET /api/scan/full/cached
- **Purpose**: Load cached full scan data
- **Reads**: Full cache JSON file (~10-100MB)
- **Returns**: `ScanResponse` with files, children_map, stats
- **Validation**: None (loads unconditionally if file exists)
- **Performance**: 50-200ms depending on file size

### GET /api/scan/full/cache/validate
- **Purpose**: Validate cache against Google Drive API
- **Reads**: Metadata sidecar + Drive API call
- **Returns**: Validated status with Drive API check results
- **Performance**: 500-2000ms (includes Drive API latency)
- **Usage**: Background validation when TTL expired

## Frontend Hook: useFullScan

The `useFullScan` hook manages the cache lifecycle:

1. **On mount**: Checks cache status immediately
2. **If cache exists**: Loads cached data in parallel
3. **If TTL expired**: Triggers background validation
4. **Staleness detection**: Uses `is_stale` flag from backend
5. **Warning management**: Exposes `cacheWarning` and `isCacheStale` for UI

## Component: DriveVisualizer

The main visualization component handles:

1. **Banner display**: Shows appropriate warning based on cache state
2. **User actions**: Handles "Refresh Scan" button clicks
3. **Data display**: Shows visualization immediately when cached data loads
4. **State management**: Coordinates between quick scan and full scan data

## Performance Characteristics

| Operation | Time | Drive API Calls |
|-----------|------|-----------------|
| Cache status check | <10ms | 0 |
| Load cached data | 50-200ms | 0 |
| Background validation | 500-2000ms | 1 |
| Full scan (fresh) | 2-5 minutes | Many |

## Related Documentation

- [CACHING_STRATEGY.md](CACHING_STRATEGY.md) - Overall caching approach
- [OPTIMIZED_CACHING.md](OPTIMIZED_CACHING.md) - Performance optimizations
- [CACHING_STATUS.md](CACHING_STATUS.md) - Cache status tracking
