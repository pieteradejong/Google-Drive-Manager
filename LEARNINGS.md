# Project Learnings

This document captures key learnings, patterns, and best practices discovered while building the Google Drive Manager application.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Testing Strategy](#testing-strategy)
3. [Caching Architecture](#caching-architecture)
4. [SQLite Indexer](#sqlite-indexer)
5. [Google Drive API](#google-drive-api)
6. [Linting & Formatting](#linting--formatting)
7. [Type Checking](#type-checking)
8. [Common Errors & Fixes](#common-errors--fixes)
9. [Common Pitfalls](#common-pitfalls)

---

## Project Structure

### Directory Layout

```
Google-Drive-Manager/
├── backend/                 # FastAPI backend
│   ├── tests/              # pytest test files
│   ├── middleware/         # Custom middleware
│   ├── utils/              # Utility modules
│   ├── main.py             # FastAPI app entry point
│   ├── drive_api.py        # Google Drive API wrapper
│   ├── cache.py            # Caching layer
│   ├── index_db.py         # SQLite database layer
│   ├── crawl_full.py       # Full crawl algorithm
│   ├── sync_changes.py     # Incremental sync using Changes API
│   ├── analytics.py        # Derived analytics computations
│   ├── queries.py          # Database query functions
│   └── health_checks.py    # Database health checks
├── frontend/               # React/TypeScript frontend
├── scripts/                # Shell scripts (init.sh, run.sh, test.sh)
├── cache/                  # Local cache files (gitignored)
└── data/                   # SQLite database (gitignored)
```

### Key Insight: Script Paths
When moving shell scripts to a `scripts/` directory, remember to update `PROJECT_ROOT`:

```bash
# Before (in project root)
PROJECT_ROOT="$SCRIPT_DIR"

# After (in scripts/ subdirectory)
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
```

---

## Testing Strategy

### Test Organization

Tests are organized by module with clear naming conventions:

- `test_<module>.py` - Unit tests for a specific module
- `conftest.py` - Shared fixtures and test utilities

### Fixture Patterns

**1. Mock External Services**
```python
@pytest.fixture
def mock_drive_service():
    """Create a mock Google Drive service."""
    service = MagicMock()
    service.files().list().execute.return_value = {'files': []}
    return service
```

**2. Temporary Databases**
```python
@pytest.fixture
def temp_db_path(tmp_path):
    """Provide a temporary database path."""
    db_file = tmp_path / "test_drive_index.db"
    init_db(db_file)
    yield db_file
    if db_file.exists():
        db_file.unlink()
```

**3. Sample Data Fixtures**
```python
@pytest.fixture
def sample_files():
    """Provide sample file data for testing."""
    return [
        {'id': 'file1', 'name': 'doc.pdf', 'mimeType': 'application/pdf', 'size': '1024'},
        {'id': 'folder1', 'name': 'Folder', 'mimeType': 'application/vnd.google-apps.folder'},
    ]
```

### Patching Best Practices

**Critical Learning: Patch Where Used, Not Where Defined**

When patching functions, patch them in the module where they're *used*, not where they're *defined*:

```python
# WRONG - patches the original definition
@patch('backend.index_db.database_exists')

# RIGHT - patches where the function is imported and used
@patch('backend.main.database_exists')  # If main.py does: from .index_db import database_exists

# ALSO RIGHT - if importing from original module
@patch('backend.index_db.database_exists')  # If code does: from backend.index_db import database_exists
```

**For locally imported functions inside endpoint handlers:**
```python
# If the import happens inside a function:
def some_endpoint():
    from .crawl_full import run_full_crawl  # Local import
    
# Patch the original module, not the endpoint module
@patch('backend.crawl_full.run_full_crawl')
```

### Test Markers

Use pytest markers for categorization:

```python
@pytest.mark.unit
@pytest.mark.integration
@pytest.mark.api
@pytest.mark.sqlite
@pytest.mark.analytics
```

Configure in `pytest.ini`:
```ini
[pytest]
markers =
    unit: Unit tests
    integration: Integration tests
    api: API endpoint tests
```

---

## Caching Architecture

### Two-Tier Caching

1. **Quick Scan Cache** - Fast overview data (quota, top folders, recent files)
2. **Full Scan Cache** - Complete file tree with all metadata

### Cache Validation Strategy

**Two-Tier Validation Approach:**

1. **Fast TTL-Based Check** (`/api/scan/full/cache/status`)
   - Reads only sidecar metadata file (no Drive API calls)
   - Uses time-based validation (30-day TTL)
   - Returns immediately: `exists`, `valid` (TTL-based), `reason` (`missing | ttl_fresh | ttl_expired`)
   - Used for instant app-load decisions

2. **Drive-Based Validation** (`/api/scan/full/cache/validate`)
   - Performs actual Drive API check for file changes
   - Can be slow (2-3 seconds) but ensures accuracy
   - Runs in background after cache loads
   - Returns: `exists`, `valid` (Drive-validated), `reason` (`ok | invalid_or_expired | error:...`)

```python
# Fast status endpoint (no Drive call)
@app.get("/api/scan/full/cache/status")
async def get_full_scan_cache_status():
    meta = get_cache_metadata("full_scan")
    if not meta:
        return FullScanCacheStatusResponse(exists=False, valid=False, reason="missing")
    
    # TTL-based check only
    ttl_valid = is_cache_valid_time_based(meta, max_age_seconds=2592000)
    return FullScanCacheStatusResponse(
        exists=True,
        valid=ttl_valid,
        reason="ttl_fresh" if ttl_valid else "ttl_expired",
        # ... metadata fields
    )

# Drive validation endpoint (can be slow)
@app.get("/api/scan/full/cache/validate")
async def validate_full_scan_cache():
    meta = get_cache_metadata("full_scan")
    service = get_service()
    # Performs Drive API check
    valid = validate_cache_with_drive(service, meta, max_age_seconds=2592000)
    return FullScanCacheStatusResponse(
        exists=True,
        valid=valid,
        reason="ok" if valid else "invalid_or_expired",
    )
```

**Frontend Cache Hydration Strategy:**

1. On app load, check cache status (fast TTL check)
2. If cache exists (`exists === true`), load cached data immediately (don't wait for validation)
3. Run Drive validation in background
4. Show progress indicators: "Loading cached scan..." → "Validating cache..."
5. If validation fails, show warning banner with "Run Full Scan" CTA

### Derived Analytics Cache

Analytics are computed once per full scan and cached separately:

```python
class AnalyticsCacheMetadata:
    computed_at: str                    # When analytics were computed
    source_cache_timestamp: str         # Full scan cache timestamp used
    source_cache_version: int           # Full scan cache version
    derived_version: int                # Analytics schema version
```

**Invalidation Rule:** Analytics cache is invalid if `source_cache_timestamp` doesn't match current full scan cache timestamp.

---

## SQLite Indexer

### Schema Design

```sql
-- Core file storage
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER DEFAULT 0,
    created_time TEXT,
    modified_time TEXT,
    trashed INTEGER DEFAULT 0,
    removed INTEGER DEFAULT 0,  -- Soft delete flag
    raw_json TEXT               -- Full API response
);

-- Parent-child relationships (supports multiple parents)
CREATE TABLE parent_edges (
    file_id TEXT NOT NULL,
    parent_id TEXT NOT NULL,
    PRIMARY KEY (file_id, parent_id)
);

-- Sync state persistence
CREATE TABLE sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

### Key Sync States

```python
# Essential sync state keys
"start_page_token"      # Changes API token for incremental sync
"last_full_crawl_time"  # Timestamp of last full crawl
"last_sync_time"        # Timestamp of last incremental sync
"file_count"            # Number of files in index
"schema_version"        # Database schema version
```

### Soft Deletes

Files are never hard-deleted; they're marked as removed:

```python
def mark_file_removed(conn, file_id):
    """Mark file as removed and delete parent edges."""
    conn.execute("UPDATE files SET removed = 1 WHERE id = ?", (file_id,))
    conn.execute("DELETE FROM parent_edges WHERE file_id = ?", (file_id,))
```

---

## Google Drive API

### Essential Endpoints

| Endpoint | Purpose |
|----------|---------|
| `files.list()` | List files with pagination |
| `files.get(fileId='root')` | Get My Drive root folder (not returned by list!) |
| `about.get()` | Get storage quota and user info |
| `changes.getStartPageToken()` | Get token for Changes API |
| `changes.list()` | Get file changes since token |

### Critical Quirk: My Drive Root Not Returned by files.list()

**Problem:** When you call `files.list()`, Google Drive returns all files and folders EXCEPT the "My Drive" root folder itself. Top-level items reference this root as their parent ID, but the root folder is not in the listing.

**Symptom:** When building a DAG from the file list, you get hundreds of "roots" (items with no known parent) instead of 1.

**Solution:** Explicitly fetch the root folder and inject it into the file list:

```python
def get_my_drive_root(service) -> Optional[Dict[str, Any]]:
    """Fetch the My Drive root folder metadata."""
    try:
        return service.files().get(fileId="root", fields=SINGLE_FILE_FIELDS).execute()
    except Exception:
        return None  # Graceful degradation

# In your scan function:
all_files = list_all_files_full(service)
root_folder = get_my_drive_root(service)
if root_folder:
    all_files.insert(0, root_folder)  # Root has parents: [], making it the true DAG root
```

**Result:** DAG now has 1 root (My Drive) instead of 600+ orphaned top-level items.

### Google Drive is a DAG, Not a Tree

Unlike local filesystems (strict trees with one parent per item), Google Drive is a **Directed Acyclic Graph (DAG)**:

| Aspect | Local Filesystem | Google Drive |
|--------|------------------|--------------|
| Structure | Tree (one parent) | DAG (multiple parents allowed) |
| Addressing | Path-based (`/home/user/file.txt`) | ID-based (parent IDs) |
| Root | Always present (`/` or `C:\`) | Must be fetched separately |

**Implication:** A file can exist in multiple folders simultaneously. Your code should:
- Store `parents` as an array, not a single value
- Handle multi-parent files in size calculations (avoid double-counting)
- Build edges for ALL parent relationships

### Pagination Pattern

```python
def list_all_files(service, query="", fields="*"):
    """Paginate through all files."""
    all_files = []
    page_token = None
    
    while True:
        response = service.files().list(
            q=query,
            fields=f"nextPageToken, files({fields})",
            pageSize=1000,
            pageToken=page_token
        ).execute()
        
        all_files.extend(response.get('files', []))
        page_token = response.get('nextPageToken')
        
        if not page_token:
            break
    
    return all_files
```

### Changes API for Incremental Sync

```python
def list_changes(service, start_token, progress_callback=None):
    """Get all changes since the given token."""
    changes = []
    page_token = start_token
    
    while True:
        response = service.changes().list(
            pageToken=page_token,
            fields="nextPageToken, newStartPageToken, changes(fileId, removed, file(*))",
            pageSize=1000,
            includeRemoved=True
        ).execute()
        
        changes.extend(response.get('changes', []))
        
        if 'newStartPageToken' in response:
            # All changes fetched, return new token
            return changes, response['newStartPageToken']
        
        page_token = response['nextPageToken']
```

### MIME Types

```python
FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
SHORTCUT_MIME_TYPE = "application/vnd.google-apps.shortcut"

# Google Workspace types (no size property)
GOOGLE_DOCS_TYPES = {
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
    # ... etc
}
```

---

## Linting & Formatting

### Tools Used

| Tool | Purpose |
|------|---------|
| **black** | Code formatting (Python) |
| **flake8** | Linting/style checking (Python) |
| **mypy** | Type checking (Python) |
| **eslint** | Linting (TypeScript/React) |

### Flake8 Configuration

Create `backend/.flake8`:

```ini
[flake8]
max-line-length = 120
extend-ignore = 
    E203,  # Whitespace before ':' (conflicts with black)
    W503,  # Line break before binary operator
    E501,  # Line too long (black handles this)
    E226,  # Missing whitespace around operator
    E722,  # Bare except
    E402,  # Import not at top
    F401,  # Unused imports
    F841,  # Unused variables
    F541   # f-string without placeholders
exclude = 
    .git,
    __pycache__,
    venv
```

### Running Formatters

```bash
# Format all Python files
python -m black backend/

# Check formatting without changes
python -m black --check backend/

# Run linter with config
python -m flake8 backend/ --config=backend/.flake8
```

### Key Learning: Black + Flake8 Compatibility

Black and flake8 can conflict. Ignore these flake8 rules when using black:
- `E203` - Whitespace before ':'
- `W503` - Line break before binary operator
- `E501` - Line too long (set higher limit or ignore)

### Shell Script Configuration

Update `test.sh` to use config files:

```bash
# Flake8 with config
if [ -f "backend/.flake8" ]; then
    python -m flake8 backend/ --config=backend/.flake8 || EXIT_CODE=1
else
    python -m flake8 backend/ --max-line-length=100 --ignore=E203,W503 || EXIT_CODE=1
fi

# Mypy with config
if [ -f "backend/mypy.ini" ]; then
    python -m mypy backend/ --config-file=backend/mypy.ini || EXIT_CODE=1
else
    python -m mypy backend/ --ignore-missing-imports || EXIT_CODE=1
fi
```

---

## Type Checking

### Mypy Configuration

Create `backend/mypy.ini` to configure Python type checking:

```ini
[mypy]
python_version = 3.11
ignore_missing_imports = True

# Fix "Source file found twice" error
mypy_path = .
explicit_package_bases = True
namespace_packages = True

# Lenient settings (can tighten incrementally)
warn_return_any = False
check_untyped_defs = False

# Disable common errors that require significant refactoring
disable_error_code = arg-type, return-value, no-any-return, var-annotated, assignment, misc

# Exclude test files from strict checking
[mypy-backend.tests.*]
ignore_errors = True
```

### TypeScript Unused Variables

Prefix unused variables with `_` to indicate intentional non-use:

```typescript
// Error: 'childrenMap' is declared but its value is never read
export const Component = ({ files, childrenMap, onClick }) => { ... }

// Fix: Prefix with underscore
export const Component = ({ files, childrenMap: _childrenMap, onClick }) => { ... }
```

---

## Common Errors & Fixes

### Error: "Source file found twice under different module names"

**Symptom:**
```
backend/index_db.py: error: Source file found twice under different module names: "index_db" and "backend.index_db"
```

**Cause:** Mypy finds the same file through multiple import paths.

**Fix:** Add to `mypy.ini`:
```ini
mypy_path = .
explicit_package_bases = True
namespace_packages = True
```

---

### Error: Flake8 not using config file

**Symptom:** Flake8 reports errors that should be ignored by `.flake8` config.

**Cause:** Running flake8 with inline options instead of config file.

**Fix:** Use `--config` flag:
```bash
# Wrong
python -m flake8 backend/ --max-line-length=100

# Right
python -m flake8 backend/ --config=backend/.flake8
```

---

### Error: Unused imports (F401)

**Symptom:**
```
backend/cache.py:4:1: F401 'os' imported but unused
```

**Options:**

1. **Remove the import** (if truly unused)
2. **Add to flake8 ignore** (if intentional re-export)
   ```ini
   extend-ignore = F401
   ```
3. **Use `__all__`** to indicate intentional exports
   ```python
   __all__ = ['function1', 'function2']
   ```

---

### Error: Line too long (E501)

**Symptom:**
```
backend/main.py:216:101: E501 line too long (199 > 100 characters)
```

**Options:**

1. **Break the line** (preferred for code)
2. **Increase max-line-length** in config
3. **Ignore E501** (if black already handles formatting)
   ```ini
   extend-ignore = E501
   ```

---

### Error: f-string without placeholders (F541)

**Symptom:**
```
backend/auth.py:117:21: F541 f-string is missing placeholders
```

**Fix:** Remove the `f` prefix or add placeholders:
```python
# Wrong
message = f"Static string without variables"

# Right
message = "Static string without variables"
# Or
message = f"String with {variable}"
```

---

### Error: TypeScript unused variable

**Symptom:**
```
error TS6133: 'childrenMap' is declared but its value is never read.
```

**Fix:** Prefix with underscore to indicate intentional non-use:
```typescript
// Before
const { files, childrenMap, onClick } = props;

// After
const { files, childrenMap: _childrenMap, onClick } = props;
```

---

### Error: Bare except clause (E722)

**Symptom:**
```
backend/cache.py:142:9: E722 do not use bare 'except'
```

**Fix:** Specify the exception type:
```python
# Wrong
try:
    risky_operation()
except:
    pass

# Right
try:
    risky_operation()
except Exception:
    pass

# Better
try:
    risky_operation()
except (ValueError, TypeError) as e:
    logger.error(f"Error: {e}")
```

---

## Common Pitfalls

### 1. Forward Type References

When using type hints that reference classes defined later or in circular imports:

```python
# Use string annotations
def compute_analytics() -> Tuple[Dict, "AnalyticsCacheMetadata"]:
    from .cache import AnalyticsCacheMetadata  # Import inside function
    ...

# Or use TYPE_CHECKING
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .cache import AnalyticsCacheMetadata
```

### 2. Async Test Fixtures

When testing FastAPI with async endpoints:

```python
# Use pytest-asyncio
@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from backend.main import app
    return TestClient(app)
```

### 3. Mock Context Managers

When mocking database connections:

```python
mock_conn = MagicMock()
mock_get_connection = MagicMock()
mock_get_connection.return_value.__enter__ = MagicMock(return_value=mock_conn)
mock_get_connection.return_value.__exit__ = MagicMock(return_value=False)
```

### 4. Thread Safety in Background Tasks

FastAPI background tasks run in threads. Avoid sharing mutable state:

```python
# Create fresh database connections per thread
def background_crawl(service):
    with get_connection() as conn:  # New connection per call
        # ... do work
```

### 5. Google Drive Multiple Parents

Files can have multiple parents (especially in shared drives):

```python
# Always handle parents as a list
parents = file.get('parents', [])
for parent_id in parents:
    replace_parents(conn, file['id'], parents)
```

---

## Performance Tips

1. **Batch Database Operations**
   ```python
   conn.executemany("INSERT OR REPLACE INTO files ...", files_batch)
   conn.commit()  # Single commit for batch
   ```

2. **Use WAL Mode for SQLite**
   ```python
   conn.execute("PRAGMA journal_mode=WAL")
   ```

3. **Progress Callbacks for Long Operations**
   ```python
   def crawl(service, progress_callback=None):
       for i, file in enumerate(files):
           process(file)
           if progress_callback and i % 100 == 0:
               progress_callback(i, len(files))
   ```

4. **Cache Expensive Computations**
   - Analytics should be computed once and cached
   - Use cache metadata to track validity

5. **Performance Logging Best Practices**
   - Use `console.warn()` for slow operations (not `console.error()`)
   - Only use `console.error()` for actual failures
   - This prevents "red noise" in DevTools console
   ```typescript
   // Good: Warn for slow operations
   if (duration > THRESHOLDS.VERY_SLOW) {
     console.warn(`[Performance] ${operationName} took ${duration}ms (VERY SLOW)`);
   }
   
   // Good: Error for failures
   catch (error) {
     console.error(`[Performance] ${operationName} failed after ${duration}ms:`, error);
   }
   ```

6. **Fast Cache Status Checks**
   - Use sidecar metadata files for instant cache status (no Drive API calls)
   - Load cached data immediately, validate in background
   - This provides instant UI hydration while ensuring data accuracy

---

## Frontend Testing with Vitest

### Setup

Frontend tests use Vitest with jsdom environment:

**`frontend/vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
```

**`frontend/src/test/setup.ts`:**
```typescript
import '@testing-library/jest-dom';
```

### Test Structure

Tests are placed alongside code or in `__tests__` directories:
```
frontend/src/utils/__tests__/driveDag.test.ts
```

### Running Tests

```bash
# Run once
cd frontend && npm run test

# Watch mode
npm run test:watch

# UI mode
npm run test:ui
```

### Test Patterns

**1. Type-only tests (verify interface shapes):**
```typescript
it('should include ownedByMe in DagNode interface', () => {
  const dag = buildDriveDag(files);
  const node = dag.nodesById.get('f1');
  expect('ownedByMe' in node!).toBe(true);
});
```

**2. Behavior tests:**
```typescript
it('should default ownedByMe to true when undefined', () => {
  const files = [createFile({ id: 'f1', name: 'test.txt' })];  // No ownedByMe
  const dag = buildDriveDag(files);
  expect(dag.nodesById.get('f1')?.ownedByMe).toBe(true);
});
```

---

## Ownership Tracking (ownedByMe)

### Background

Google Drive distinguishes between:
- **Owned files** (`ownedByMe: true`) - Files you created/uploaded
- **Shared files** (`ownedByMe: false`) - Files shared with you by others

Shared files often appear as "orphan roots" in the DAG because their parent folders are in another user's Drive (not accessible to you).

### Data Structure

**DagNode (frontend):**
```typescript
interface DagNode {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  ownedByMe: boolean;  // ← Ownership flag
  parents: string[];
  children: string[];
  file: FileItem;
}
```

**DagOwnershipStats:**
```typescript
interface DagOwnershipStats {
  ownedCount: number;
  sharedCount: number;
  ownedSizeBytes: number;
  sharedSizeBytes: number;
}
```

### Usage in Views

**1. Filter shared files:**
```typescript
const myFiles = files.filter(f => f.ownedByMe !== false);
```

**2. Visual indicator:**
```typescript
const sharedBadge = !node.ownedByMe ? (
  <span className="badge-purple">shared</span>
) : null;
```

**3. Toggle in DAG controls:**
```typescript
interface DagFilters {
  hideShared: boolean;  // When true, filter out ownedByMe=false
  // ...
}
```

### Default Behavior

When `ownedByMe` is undefined (legacy data), it defaults to `true`:
```typescript
ownedByMe: f.ownedByMe ?? true
```

This ensures backwards compatibility with cached data that lacks the field.

---

## Frontend Cache Hydration Pattern

### Immediate Cache Loading with Background Validation

The frontend implements a pattern for instant cache hydration while ensuring data accuracy:

**1. Fast Status Check (App Load)**
```typescript
// Fast TTL-based check (no Drive API call)
const { data: cacheStatus } = useQuery({
  queryKey: ['fullScanCacheStatus'],
  queryFn: () => api.getFullScanCacheStatus(), // Fast sidecar-only check
});
```

**2. Immediate Cache Load**
```typescript
// Load cache immediately if it exists (don't wait for validation)
const shouldFetchCachedFullScan = cacheStatus?.exists === true;

const { data: cachedData, isLoading: isCacheLoading } = useQuery({
  queryKey: ['fullScanResult'],
  queryFn: () => api.getCachedFullScan(),
  enabled: shouldFetchCachedFullScan, // Load when exists, not when valid
});
```

**3. Background Validation**
```typescript
// Validate in background after cache loads
const shouldValidateCache = cacheStatus?.exists === true && 
                            (cachedData !== undefined || cacheStatus?.reason === 'ttl_expired');

const { data: validationStatus, isLoading: isValidatingCache } = useQuery({
  queryKey: ['fullScanCacheValidation'],
  queryFn: () => api.validateFullScanCache(), // Drive API validation
  enabled: shouldValidateCache,
});
```

**4. UI Progress Indicators**
```typescript
// Show clear progress states
{isLoadingCachedScan && "Loading cached scan..."}
{isValidatingCache && "Validating cache..."}
{cacheWarning && <WarningBanner message={cacheWarning} />}
```

**Benefits:**
- Instant UI hydration (no waiting for slow Drive validation)
- User sees data immediately
- Background validation ensures accuracy
- Clear feedback when cache is invalid

---

## Future Improvements

- [ ] Add pre-commit hooks for automated linting
- [ ] Implement database migrations for schema changes
- [ ] Add retry logic for Google API rate limits
- [ ] Consider async database operations for better concurrency
- [x] Add frontend unit tests with Vitest
- [x] Implement fast cache status checks with background validation
