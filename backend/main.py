"""FastAPI application entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from typing import Dict, Any, Optional, List, Tuple
import uuid
import time
from threading import Thread

from .auth import authenticate
from .drive_api import (
    list_all_files,
    build_tree_structure,
    get_drive_overview,
    get_top_level_folders,
)
from .utils.logger import PerformanceLogger, log_timing, log_operation
from .models import (
    ScanResponse,
    HealthResponse,
    FileItem,
    DriveStats,
    QuickScanResponse,
    ScanProgress,
    FullScanStatusResponse,
    AnalyticsStatusResponse,
    AnalyticsViewResponse,
)
from .cache import (
    load_cache,
    save_cache,
    get_cache_metadata,
    CacheMetadata,
    validate_cache_with_drive,
    clear_cache,
    get_full_scan_analytics_metadata,
    is_analytics_cache_valid,
)
from .analytics import save_full_scan_analytics_cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events."""
    # Startup
    try:
        get_service()
        log_operation("startup.service_init", logger_name="main", status="success")
    except FileNotFoundError:
        perf_logger.warning(
            "startup.service_init",
            message="Google OAuth credentials not found. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars, or add credentials.json to project root.",
        )
    except Exception as e:
        perf_logger.warning(
            "startup.service_init",
            message=f"Could not initialize Drive service: {str(e)}",
        )
    yield
    # Shutdown (nothing to clean up currently)


app = FastAPI(
    title="Google Drive Manager API",
    description="API for scanning and visualizing Google Drive structure",
    version="1.0.0",
    lifespan=lifespan,
)

# GZip responses (especially analytics payloads)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Performance tracking middleware
from .middleware.performance import PerformanceMiddleware

app.add_middleware(PerformanceMiddleware, slow_request_threshold_ms=1000.0)

# Global service instance (initialized on first use)
_service = None

# In-memory scan state tracking (use Redis in production)
_scan_states: Dict[str, Dict[str, Any]] = {}

# In-memory analytics compute state (use Redis in production)
_analytics_state: Dict[str, Any] = {
    "status": "missing",  # missing | running | ready | error
    "started_at": None,
    "completed_at": None,
    "error": None,
}

# Performance logger
perf_logger = PerformanceLogger("main")


def get_service():
    """Get or initialize the Drive service."""
    global _service
    if _service is None:
        _service = authenticate()
    return _service


@app.get("/api/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    return HealthResponse(status="ok")


@app.get("/api/scan/quick", response_model=QuickScanResponse)
async def quick_scan() -> QuickScanResponse:
    """
    Quick scan that returns Drive overview and top-level folders only.

    This is fast (1-3 API calls) and gives immediate feedback:
    - Drive storage quota and usage
    - Top-level folders with approximate sizes
    - Estimate of total files

    Uses caching with 1 hour TTL for faster responses.

    Returns:
        QuickScanResponse with overview and top folders
    """
    scan_start = time.perf_counter()
    try:
        # Check cache first
        cache_data = load_cache("quick_scan")
        if cache_data:
            metadata = CacheMetadata(**cache_data["metadata"])
            service = get_service()
            # Quick scan uses smart validation: 7 days TTL + Drive API check
            # Since files rarely change, we can extend cache significantly
            if validate_cache_with_drive(
                service, metadata, max_age_seconds=604800
            ):  # 7 days initial TTL
                log_operation("quick_scan.cache_hit", logger_name="main")
                # Convert cached data back to QuickScanResponse
                cached_response = cache_data["data"]
                return QuickScanResponse(**cached_response)
            else:
                log_operation(
                    "quick_scan.cache_miss", logger_name="main", reason="drive_changed"
                )

        log_operation("quick_scan.start", logger_name="main")
        service = get_service()

        # Get Drive overview (1 API call)
        with log_timing("quick_scan.get_overview"):
            overview = get_drive_overview(service)

        # Get top-level folders (1-2 API calls)
        top_folders, estimated_total = get_top_level_folders(service)

        # Convert to FileItem models
        folder_items = [FileItem(**folder) for folder in top_folders]

        response = QuickScanResponse(
            overview=overview,
            top_folders=folder_items,
            estimated_total_files=estimated_total,
        )

        # Cache the result
        from datetime import datetime, timezone

        metadata = CacheMetadata(
            timestamp=datetime.now(timezone.utc).isoformat(),
            file_count=len(folder_items),
            total_size=None,
            cache_version=1,
        )
        # Convert response to dict for caching
        response_dict = response.model_dump()
        save_cache("quick_scan", response_dict, metadata)

        total_duration_ms = (time.perf_counter() - scan_start) * 1000
        perf_logger.info(
            "quick_scan",
            duration_ms=total_duration_ms,
            folders=len(folder_items),
            estimated_total=estimated_total,
        )

        return response

    except FileNotFoundError as e:
        if "credentials" in str(e).lower():
            raise HTTPException(
                status_code=500,
                detail=str(e)
                + " See CREDENTIALS_SETUP.md or SETUP.md for setup instructions.",
            )
        raise HTTPException(status_code=500, detail=f"Authentication error: {str(e)}")
    except OSError as e:
        # Network-related errors (connection refused, address in use, etc.)
        error_msg = str(e)
        if "Errno 49" in error_msg or "Can't assign requested address" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Network connection error: Unable to connect to Google Drive API. This may be a temporary network issue. Please check your internet connection and try again in a few moments.",
            )
        elif "Errno 61" in error_msg or "Connection refused" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Network connection error: Connection to Google Drive API was refused. Please check your internet connection and try again.",
            )
        else:
            raise HTTPException(
                status_code=503,
                detail=f"Network error: {error_msg}. Please check your internet connection and try again.",
            )
    except Exception as e:
        import traceback

        error_detail = str(e)
        print(f"Error in quick scan: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500, detail=f"Error in quick scan: {error_detail}"
        )


@app.get("/api/scan", response_model=ScanResponse)
async def scan_drive() -> ScanResponse:
    """
    Scan entire Google Drive and return file structure.

    This endpoint:
    1. Authenticates with Google Drive (may open browser for OAuth)
    2. Fetches all files from Google Drive
    3. Builds parent-child tree structure
    4. Calculates folder sizes recursively
    5. Returns structured data for visualization

    Returns:
        ScanResponse with files, children_map, and stats
    """
    try:
        print("Starting Google Drive scan...")
        print("Step 1/4: Authenticating with Google Drive...")
        service = get_service()
        print("✓ Authentication successful")

        print("Step 2/4: Fetching all files from Google Drive...")
        print("  (This may take a while for large drives)")
        # Fetch all files
        all_files = list_all_files(service)
        print(f"✓ Fetched {len(all_files)} files/folders")

        if not all_files:
            print("⚠ No files found in Drive")
            return ScanResponse(
                files=[],
                children_map={},
                stats=DriveStats(
                    total_files=0, total_size=0, folder_count=0, file_count=0
                ),
            )

        print("Step 3/4: Building folder structure and calculating sizes...")
        # Build tree structure
        tree_data = build_tree_structure(all_files)
        print("✓ Tree structure built")

        print("Step 4/4: Calculating statistics...")
        # Calculate statistics
        folders = [
            f
            for f in all_files
            if f["mimeType"] == "application/vnd.google-apps.folder"
        ]
        files_only = [
            f
            for f in all_files
            if f["mimeType"] != "application/vnd.google-apps.folder"
        ]

        # Calculate total size
        total_size = sum(
            int(f.get("calculatedSize") or f.get("size") or 0) for f in all_files
        )

        stats = DriveStats(
            total_files=len(all_files),
            total_size=total_size,
            folder_count=len(folders),
            file_count=len(files_only),
        )

        # Convert files to FileItem models
        file_items = [FileItem(**file) for file in tree_data["files"]]

        print(
            f"✓ Scan complete: {stats.total_files} items, {stats.total_size / (1024**3):.2f} GB"
        )

        return ScanResponse(
            files=file_items, children_map=tree_data["children_map"], stats=stats
        )

    except FileNotFoundError as e:
        if "credentials" in str(e).lower():
            raise HTTPException(
                status_code=500,
                detail=str(e)
                + " See CREDENTIALS_SETUP.md or SETUP.md for setup instructions.",
            )
        raise HTTPException(status_code=500, detail=f"Authentication error: {str(e)}")
    except OSError as e:
        # Network-related errors (connection refused, address in use, etc.)
        error_msg = str(e)
        if "Errno 49" in error_msg or "Can't assign requested address" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Network connection error: Unable to connect to Google Drive API. This may be a temporary network issue. Please check your internet connection and try again in a few moments.",
            )
        elif "Errno 61" in error_msg or "Connection refused" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Network connection error: Connection to Google Drive API was refused. Please check your internet connection and try again.",
            )
        else:
            raise HTTPException(
                status_code=503,
                detail=f"Network error: {error_msg}. Please check your internet connection and try again.",
            )
    except Exception as e:
        import traceback

        error_detail = str(e)
        # Log full traceback for debugging
        print(f"Error scanning Drive: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500, detail=f"Error scanning Drive: {error_detail}"
        )


def run_full_scan(scan_id: str):
    """Run full scan in background thread."""
    scan_start = time.perf_counter()

    # Ensure scan state exists before starting
    if scan_id not in _scan_states:
        _scan_states[scan_id] = {"status": "starting", "progress": None, "result": None}

    try:
        log_operation("full_scan.start", logger_name="main", scan_id=scan_id)
        _scan_states[scan_id]["status"] = "running"
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id, stage="fetching", progress=0.0, message="Starting scan..."
        )

        service = get_service()

        # Fetch all files with progress updates
        # Note: list_all_files() now has its own timing, but we still track overall fetch time
        fetch_start = time.perf_counter()
        all_files = list_all_files(service)
        fetch_duration_ms = (time.perf_counter() - fetch_start) * 1000

        # Update progress after fetching
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="fetching",
            progress=50.0,
            files_fetched=len(all_files),
            message=f"Fetched {len(all_files)} files...",
        )

        fetch_duration_ms = (time.perf_counter() - fetch_start) * 1000
        perf_logger.info(
            "full_scan.fetching",
            duration_ms=fetch_duration_ms,
            files=len(all_files),
            scan_id=scan_id,
        )

        # Update: building tree (50-75%)
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="building_tree",
            progress=50.0,
            files_fetched=len(all_files),
            message="Building folder structure...",
        )

        # Build tree structure
        tree_start = time.perf_counter()
        tree_data = build_tree_structure(all_files)
        tree_duration_ms = (time.perf_counter() - tree_start) * 1000
        perf_logger.info(
            "full_scan.building_tree",
            duration_ms=tree_duration_ms,
            files=len(all_files),
            scan_id=scan_id,
        )

        # Update: calculating sizes (75-95%)
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="calculating_sizes",
            progress=75.0,
            files_fetched=len(all_files),
            message="Calculating folder sizes...",
        )

        # Calculate statistics
        folders = [
            f
            for f in all_files
            if f["mimeType"] == "application/vnd.google-apps.folder"
        ]
        files_only = [
            f
            for f in all_files
            if f["mimeType"] != "application/vnd.google-apps.folder"
        ]
        total_size = sum(
            int(f.get("calculatedSize") or f.get("size") or 0) for f in all_files
        )

        stats = DriveStats(
            total_files=len(all_files),
            total_size=total_size,
            folder_count=len(folders),
            file_count=len(files_only),
        )

        # Convert to FileItem models
        file_items = [FileItem(**file) for file in tree_data["files"]]

        result = ScanResponse(
            files=file_items, children_map=tree_data["children_map"], stats=stats
        )

        # Mark as complete
        _scan_states[scan_id]["status"] = "complete"
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="complete",
            progress=100.0,
            files_fetched=len(all_files),
            message="Scan complete!",
        )
        _scan_states[scan_id]["result"] = result

        # Cache the result
        cache_start = time.perf_counter()
        from datetime import datetime, timezone

        metadata = CacheMetadata(
            timestamp=datetime.now(timezone.utc).isoformat(),
            file_count=stats.total_files,
            total_size=stats.total_size,
            cache_version=1,
        )
        # Convert result to dict for caching
        result_dict = result.model_dump()
        save_cache("full_scan", result_dict, metadata)
        cache_duration_ms = (time.perf_counter() - cache_start) * 1000

        total_duration_ms = (time.perf_counter() - scan_start) * 1000
        perf_logger.info(
            "full_scan.complete",
            duration_ms=total_duration_ms,
            files=stats.total_files,
            folders=stats.folder_count,
            size_gb=stats.total_size / (1024**3),
            cache_duration_ms=cache_duration_ms,
            scan_id=scan_id,
        )

        # Kick off analytics computation in background (best-effort)
        try:
            start_analytics_compute_if_needed()
        except Exception:
            pass

    except OSError as e:
        # Network-related errors
        error_msg = str(e)
        if "Errno 49" in error_msg or "Can't assign requested address" in error_msg:
            error_detail = "Network connection error: Unable to connect to Google Drive API. This may be a temporary network issue. Please check your internet connection and try again."
        elif "Errno 61" in error_msg or "Connection refused" in error_msg:
            error_detail = "Network connection error: Connection to Google Drive API was refused. Please check your internet connection and try again."
        else:
            error_detail = f"Network error: {error_msg}. Please check your internet connection and try again."

        perf_logger.error(
            "full_scan.network_error", message=error_detail, scan_id=scan_id
        )

        # Ensure scan state exists before updating error status
        if scan_id not in _scan_states:
            _scan_states[scan_id] = {
                "status": "error",
                "progress": None,
                "result": None,
            }

        _scan_states[scan_id]["status"] = "error"
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id, stage="error", progress=0.0, message=error_detail
        )
    except Exception as e:
        import traceback

        error_detail = str(e)
        perf_logger.error(
            "full_scan.error",
            message=f"Error in full scan: {error_detail}",
            scan_id=scan_id,
        )
        print(traceback.format_exc())

        # Ensure scan state exists before updating error status
        if scan_id not in _scan_states:
            _scan_states[scan_id] = {
                "status": "error",
                "progress": None,
                "result": None,
            }

        _scan_states[scan_id]["status"] = "error"
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="error",
            progress=0.0,
            message=f"Error: {error_detail}",
        )


@app.post("/api/scan/full/start")
async def start_full_scan() -> Dict[str, str]:
    """
    Start a full background scan of the Drive.

    Checks cache first - if valid cache exists, returns immediately.
    Otherwise starts background scan.

    Returns:
        Dictionary with scan_id to poll for status
    """
    try:
        # Check cache first
        cache_data = load_cache("full_scan")
        if cache_data:
            metadata = CacheMetadata(**cache_data["metadata"])
            service = get_service()
            # Full scan uses smart validation: 30 days initial TTL + Drive API check
            # Since files rarely change, cache can persist indefinitely until files actually change
            if validate_cache_with_drive(
                service, metadata, max_age_seconds=2592000
            ):  # 30 days initial TTL
                # Create a scan_id and immediately mark as complete with cached result
                scan_id = str(uuid.uuid4())
                log_operation(
                    "full_scan.cache_hit", logger_name="main", scan_id=scan_id
                )
                cached_response = cache_data["data"]
                result = ScanResponse(**cached_response)

                # Initialize scan state as complete
                _scan_states[scan_id] = {
                    "status": "complete",
                    "progress": ScanProgress(
                        scan_id=scan_id,
                        stage="complete",
                        progress=100.0,
                        files_fetched=result.stats.total_files,
                        message="Scan complete! (from cache)",
                    ),
                    "result": result,
                }
                # If analytics cache is missing/outdated, kick it off in background
                try:
                    start_analytics_compute_if_needed()
                except Exception:
                    pass
                return {"scan_id": scan_id}
            else:
                log_operation(
                    "full_scan.cache_miss",
                    logger_name="main",
                    reason="invalid_or_expired",
                )

        scan_id = str(uuid.uuid4())

        # Initialize scan state
        _scan_states[scan_id] = {"status": "starting", "progress": None, "result": None}

        # Start scan in background thread
        thread = Thread(target=run_full_scan, args=(scan_id,), daemon=True)
        thread.start()

        return {"scan_id": scan_id}

    except Exception as e:
        import traceback

        error_detail = str(e)
        perf_logger.error(
            "start_full_scan", message=f"Error starting full scan: {error_detail}"
        )
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500, detail=f"Error starting full scan: {error_detail}"
        )


@app.delete("/api/cache")
async def invalidate_cache(scan_type: Optional[str] = None) -> Dict[str, str]:
    """
    Invalidate cache for scan results.

    Args:
        scan_type: 'quick_scan', 'full_scan', or None to clear all caches

    Returns:
        Success message
    """
    try:
        if clear_cache(scan_type):
            if scan_type:
                return {"message": f"Cache cleared for {scan_type}"}
            else:
                return {"message": "All caches cleared"}
        else:
            raise HTTPException(status_code=500, detail="Failed to clear cache")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing cache: {str(e)}")


@app.get("/api/scan/full/cached", response_model=ScanResponse)
async def get_cached_full_scan() -> ScanResponse:
    """
    Get cached full scan data if available and valid.

    This endpoint returns cached data immediately without starting a scan.
    Use this for instant page load when cache exists.

    Returns:
        ScanResponse with cached files, children_map, and stats

    Raises:
        404: No valid cache available
    """
    try:
        cache_data = load_cache("full_scan")
        if not cache_data:
            raise HTTPException(status_code=404, detail="No cached data available")

        metadata = CacheMetadata(**cache_data["metadata"])
        service = get_service()

        # Validate cache using same logic as start_full_scan
        if not validate_cache_with_drive(
            service, metadata, max_age_seconds=2592000
        ):  # 30 days
            raise HTTPException(status_code=404, detail="Cache expired or invalid")

        # Kick off analytics compute if needed (background)
        try:
            start_analytics_compute_if_needed()
        except Exception:
            pass

        return ScanResponse(**cache_data["data"])

    except HTTPException:
        raise
    except Exception as e:
        perf_logger.error(
            "get_cached_full_scan", message=f"Error loading cache: {str(e)}"
        )
        raise HTTPException(status_code=404, detail="Cache unavailable")


@app.get("/api/scan/full/status/{scan_id}", response_model=FullScanStatusResponse)
async def get_scan_status(scan_id: str) -> FullScanStatusResponse:
    """
    Get the status and progress of a full scan.

    Args:
        scan_id: The scan ID returned from /api/scan/full/start

    Returns:
        FullScanStatusResponse with current progress and result (if complete)
    """
    if scan_id not in _scan_states:
        raise HTTPException(status_code=404, detail="Scan ID not found")

    state = _scan_states[scan_id]
    progress = state.get("progress")

    if not progress:
        progress = ScanProgress(
            scan_id=scan_id,
            stage="starting",
            progress=0.0,
            message="Initializing scan...",
        )

    return FullScanStatusResponse(
        scan_id=scan_id,
        status=state["status"],
        progress=progress,
        result=state.get("result"),
    )


def _current_full_scan_cache_metadata() -> Optional[CacheMetadata]:
    # Use sidecar metadata (fast) instead of loading full cache JSON
    return get_cache_metadata("full_scan")


def start_analytics_compute_if_needed() -> bool:
    """
    Start analytics computation in a background thread if full_scan cache exists and
    derived analytics cache is missing/outdated.

    Returns True if a background job was started.
    """
    # If already running, do nothing
    if _analytics_state.get("status") == "running":
        return False

    full_meta = _current_full_scan_cache_metadata()
    if not full_meta:
        _analytics_state.update(
            {"status": "missing", "error": "full_scan cache missing"}
        )
        return False

    analytics_meta = get_full_scan_analytics_metadata()
    if analytics_meta and is_analytics_cache_valid(analytics_meta, full_meta):
        _analytics_state.update({"status": "ready", "error": None})
        return False

    def _worker():
        _analytics_state.update(
            {
                "status": "running",
                "started_at": time.time(),
                "completed_at": None,
                "error": None,
            }
        )
        try:
            cache_data = load_cache("full_scan")
            if not cache_data:
                raise RuntimeError("full_scan cache missing")
            ok = save_full_scan_analytics_cache(cache_data)
            if not ok:
                raise RuntimeError("failed to save analytics cache")
            _analytics_state.update(
                {"status": "ready", "completed_at": time.time(), "error": None}
            )
        except Exception as e:
            _analytics_state.update(
                {"status": "error", "completed_at": time.time(), "error": str(e)}
            )

    Thread(target=_worker, daemon=True).start()
    return True


@app.get("/api/analytics/status", response_model=AnalyticsStatusResponse)
async def analytics_status() -> AnalyticsStatusResponse:
    full_meta = _current_full_scan_cache_metadata()
    analytics_meta = get_full_scan_analytics_metadata()

    if not full_meta:
        return AnalyticsStatusResponse(
            status="missing", message="Full scan cache not available"
        )

    # If background worker is running, report that first
    if _analytics_state.get("status") == "running":
        return AnalyticsStatusResponse(
            status="running",
            message="Analytics computation in progress",
            source_cache_timestamp=full_meta.timestamp,
            source_cache_version=full_meta.cache_version,
        )

    if analytics_meta and is_analytics_cache_valid(analytics_meta, full_meta):
        return AnalyticsStatusResponse(
            status="ready",
            message="Analytics cache ready",
            source_cache_timestamp=analytics_meta.source_cache_timestamp,
            source_cache_version=analytics_meta.source_cache_version,
            derived_version=analytics_meta.derived_version,
            computed_at=analytics_meta.computed_at,
            timings_ms=analytics_meta.timings_ms,
        )

    if _analytics_state.get("status") == "error":
        return AnalyticsStatusResponse(
            status="error",
            message="Analytics computation failed",
            error=_analytics_state.get("error"),
            source_cache_timestamp=full_meta.timestamp,
            source_cache_version=full_meta.cache_version,
        )

    return AnalyticsStatusResponse(
        status="missing",
        message="Analytics cache missing or outdated",
        source_cache_timestamp=full_meta.timestamp,
        source_cache_version=full_meta.cache_version,
    )


@app.post("/api/analytics/start", response_model=AnalyticsStatusResponse)
async def analytics_start() -> AnalyticsStatusResponse:
    # Start compute if needed, but do not block on reading large cache files.
    start_analytics_compute_if_needed()

    full_meta = _current_full_scan_cache_metadata()
    if not full_meta:
        return AnalyticsStatusResponse(
            status="missing", message="Full scan cache not available"
        )

    # If we just kicked it off (or it's already running), report running quickly.
    if _analytics_state.get("status") == "running":
        return AnalyticsStatusResponse(
            status="running",
            message="Analytics computation in progress",
            source_cache_timestamp=full_meta.timestamp,
            source_cache_version=full_meta.cache_version,
        )

    # Otherwise fall back to status (fast path should now use sidecar metadata)
    return await analytics_status()


def _etag_for(
    view: str, meta_source_ts: str, derived_version: int, extra: str = ""
) -> str:
    base = f"{derived_version}:{meta_source_ts}:{view}:{extra}"
    return f'W/"{base}"'


def _set_cache_headers(response: Response, *, etag: str, last_modified: str) -> None:
    response.headers["ETag"] = etag
    response.headers["Last-Modified"] = last_modified
    # allow client caching; versioned by ETag/Last-Modified
    response.headers["Cache-Control"] = "public, max-age=3600"


def _build_file_index_from_full_scan() -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Load full_scan cache and build an id->file dict for quick lookups.
    Returns (scan_data, file_by_id)
    """
    cache_data = load_cache("full_scan")
    if not cache_data:
        raise RuntimeError("full_scan cache missing")
    scan_data = cache_data["data"]
    files = scan_data.get("files") or []
    file_by_id = {f.get("id"): f for f in files if f.get("id")}
    return scan_data, file_by_id


def _path_for(file_id: str, file_by_id: Dict[str, Any]) -> str:
    """
    Compute a human-readable folder path for a file (follow first parent chain).
    """
    names: List[str] = []
    visited: set[str] = set()
    current = file_id
    while current and current not in visited:
        visited.add(current)
        f = file_by_id.get(current)
        if not f:
            break
        parents = f.get("parents") or []
        if not parents:
            break
        parent = parents[0]
        pf = file_by_id.get(parent)
        if not pf:
            break
        names.append(pf.get("name") or "")
        current = parent
    # names currently from leaf up; reverse
    names = [n for n in reversed(names) if n]
    return "/" + "/".join(names) if names else "Root"


@app.get("/api/analytics/view/{view}", response_model=AnalyticsViewResponse)
async def analytics_view(
    view: str,
    response: Response,
    limit: int = 200,
    offset: int = 0,
    category: Optional[str] = None,
    file_type: Optional[str] = None,
) -> AnalyticsViewResponse:
    """
    Return cached analytics payload for a specific view.
    Views: duplicates, semantic, depths, orphans, timeline, types, large
    """
    full_meta = _current_full_scan_cache_metadata()
    if not full_meta:
        raise HTTPException(status_code=400, detail="Full scan cache not available")

    analytics_cache = load_cache("full_scan_analytics")
    analytics_meta = get_full_scan_analytics_metadata()
    if (
        not analytics_cache
        or not analytics_meta
        or not is_analytics_cache_valid(analytics_meta, full_meta)
    ):
        # Start compute and ask client to poll
        start_analytics_compute_if_needed()
        raise HTTPException(
            status_code=409,
            detail="Analytics not ready yet. Call /api/analytics/status and retry.",
        )

    data = analytics_cache.get("data") or {}
    derived_version = int(
        data.get("derived_version") or analytics_meta.derived_version or 1
    )

    # Basic routing
    if view == "duplicates":
        duplicates = data.get("duplicates") or {}
        groups = duplicates.get("groups") or []
        total_groups = len(groups)
        page = groups[offset : offset + limit]

        scan_data, file_by_id = _build_file_index_from_full_scan()

        # Build minimal file objects and computed paths for returned file ids only
        file_ids = []
        for g in page:
            file_ids.extend(g.get("file_ids") or [])
        uniq_ids = list(dict.fromkeys([fid for fid in file_ids if fid]))

        files_out = []
        for fid in uniq_ids:
            f = file_by_id.get(fid)
            if not f:
                continue
            files_out.append(
                {
                    "id": f.get("id"),
                    "name": f.get("name"),
                    "mimeType": f.get("mimeType"),
                    "size": f.get("size"),
                    "createdTime": f.get("createdTime"),
                    "modifiedTime": f.get("modifiedTime"),
                    "webViewLink": f.get("webViewLink"),
                    "parents": f.get("parents") or [],
                    "path": _path_for(fid, file_by_id),
                }
            )

        payload = {
            "total_groups": total_groups,
            "offset": offset,
            "limit": limit,
            "total_potential_savings": duplicates.get("total_potential_savings") or 0,
            "groups": page,
            "files": files_out,
        }
        etag = _etag_for(
            view,
            analytics_meta.source_cache_timestamp,
            derived_version,
            f"{offset}:{limit}",
        )
        _set_cache_headers(
            response, etag=etag, last_modified=analytics_meta.computed_at
        )
        return AnalyticsViewResponse(
            view=view,
            source_cache_timestamp=analytics_meta.source_cache_timestamp,
            derived_version=derived_version,
            computed_at=analytics_meta.computed_at,
            data=payload,
        )

    if view == "type_semantic" and category and file_type:
        # Provide file list details for a specific category×type cell to avoid client-side scans
        semantic_map = (data.get("semantic") or {}).get("folder_category") or {}

        def _file_type_group(mime: str) -> str:
            m = (mime or "").lower()
            if m.startswith("image/"):
                return "Images"
            if m.startswith("video/"):
                return "Videos"
            if m.startswith("audio/"):
                return "Audio"
            if (
                m.startswith("application/pdf")
                or m.startswith("application/vnd.google-apps.document")
                or m.startswith("application/msword")
                or m.startswith("application/vnd.openxmlformats")
            ):
                return "Documents"
            return "Other"

        scan_data, file_by_id = _build_file_index_from_full_scan()
        files_all = scan_data.get("files") or []
        matched: List[Dict[str, Any]] = []
        for f in files_all:
            if f.get("mimeType") == "application/vnd.google-apps.folder":
                continue
            parents = f.get("parents") or []
            parent = parents[0] if parents else None
            cat = "Uncategorized"
            if parent and parent in semantic_map:
                cat = semantic_map[parent].get("category") or "Uncategorized"
            if cat != category:
                continue
            if _file_type_group(f.get("mimeType") or "") != file_type:
                continue
            matched.append(f)

        total_count = len(matched)
        # Sort by size desc
        matched.sort(key=lambda x: int(x.get("size") or 0), reverse=True)
        page = matched[offset : offset + limit]
        files_out = []
        for f in page:
            fid = f.get("id")
            if not fid:
                continue
            files_out.append(
                {
                    "id": f.get("id"),
                    "name": f.get("name"),
                    "mimeType": f.get("mimeType"),
                    "size": f.get("size"),
                    "createdTime": f.get("createdTime"),
                    "modifiedTime": f.get("modifiedTime"),
                    "webViewLink": f.get("webViewLink"),
                    "parents": f.get("parents") or [],
                    "path": _path_for(fid, file_by_id),
                }
            )

        payload = {
            "category": category,
            "file_type": file_type,
            "total_count": total_count,
            "offset": offset,
            "limit": limit,
            "files": files_out,
        }
        etag = _etag_for(
            view,
            analytics_meta.source_cache_timestamp,
            derived_version,
            f"{category}:{file_type}:{offset}:{limit}",
        )
        _set_cache_headers(
            response, etag=etag, last_modified=analytics_meta.computed_at
        )
        return AnalyticsViewResponse(
            view=view,
            source_cache_timestamp=analytics_meta.source_cache_timestamp,
            derived_version=derived_version,
            computed_at=analytics_meta.computed_at,
            data=payload,
        )

    if view in (
        "semantic",
        "depths",
        "orphans",
        "timeline",
        "types",
        "large",
        "age_semantic",
        "type_semantic",
    ):
        payload = data.get(view) or {}
        etag = _etag_for(view, analytics_meta.source_cache_timestamp, derived_version)
        _set_cache_headers(
            response, etag=etag, last_modified=analytics_meta.computed_at
        )
        return AnalyticsViewResponse(
            view=view,
            source_cache_timestamp=analytics_meta.source_cache_timestamp,
            derived_version=derived_version,
            computed_at=analytics_meta.computed_at,
            data=payload,
        )

    raise HTTPException(status_code=404, detail=f"Unknown analytics view '{view}'")


# =============================================================================
# SQLite Index Endpoints (New architecture per SPECIFICATION.md)
# =============================================================================

# In-memory state for SQLite crawl/sync operations
_sqlite_scan_states: Dict[str, Dict[str, Any]] = {}


@app.get("/api/index/status")
async def get_index_status() -> Dict[str, Any]:
    """
    Get the status of the SQLite index.

    Returns:
        Dict with index status, last crawl time, file count, etc.
    """
    from .index_db import (
        database_exists,
        get_connection,
        get_db_path,
        get_sync_state,
        get_file_count,
    )
    from .crawl_full import needs_full_crawl, get_last_crawl_info
    from .sync_changes import can_sync

    try:
        db_path = get_db_path()

        if not database_exists(db_path):
            return {
                "status": "not_initialized",
                "message": "SQLite index not created. Run a full crawl first.",
                "can_crawl": True,
                "can_sync": False,
            }

        crawl_info = get_last_crawl_info(db_path)

        if not crawl_info:
            return {
                "status": "empty",
                "message": "Database exists but no crawl completed.",
                "can_crawl": True,
                "can_sync": False,
            }

        with get_connection(db_path) as conn:
            file_count = get_file_count(conn)

        return {
            "status": "ready",
            "message": "SQLite index is ready",
            "last_full_crawl_time": crawl_info.get("last_full_crawl_time"),
            "last_sync_time": crawl_info.get("last_sync_time"),
            "file_count": file_count,
            "can_crawl": True,
            "can_sync": can_sync(db_path),
            "db_path": str(db_path),
        }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "can_crawl": True,
            "can_sync": False,
        }


@app.post("/api/index/crawl/start")
async def start_index_crawl(force: bool = False) -> Dict[str, str]:
    """
    Start a full crawl to build/rebuild the SQLite index.

    Args:
        force: If True, forces a full crawl even if sync is available

    Returns:
        Dict with scan_id to poll for status
    """
    from .crawl_full import run_full_crawl, CrawlProgress
    from .sync_changes import smart_sync

    scan_id = str(uuid.uuid4())

    # Initialize state
    _sqlite_scan_states[scan_id] = {
        "status": "starting",
        "type": "crawl",
        "progress": None,
        "result": None,
    }

    def run_crawl():
        try:
            service = get_service()

            def progress_callback(progress: CrawlProgress):
                _sqlite_scan_states[scan_id]["progress"] = progress.to_dict()
                _sqlite_scan_states[scan_id]["status"] = progress.stage

            if force:
                progress = run_full_crawl(service, progress_callback=progress_callback)
                _sqlite_scan_states[scan_id]["type"] = "full_crawl"
            else:
                result = smart_sync(
                    service, progress_callback=progress_callback, force_full_crawl=force
                )
                _sqlite_scan_states[scan_id]["type"] = result["type"]
                progress = result["progress"]

            _sqlite_scan_states[scan_id]["status"] = "complete"
            _sqlite_scan_states[scan_id]["result"] = (
                progress if isinstance(progress, dict) else progress.to_dict()
            )

        except Exception as e:
            import traceback

            _sqlite_scan_states[scan_id]["status"] = "error"
            _sqlite_scan_states[scan_id]["error"] = str(e)
            perf_logger.error("index_crawl", message=str(e))
            traceback.print_exc()

    thread = Thread(target=run_crawl, daemon=True)
    thread.start()

    return {"scan_id": scan_id}


@app.post("/api/index/sync/start")
async def start_index_sync() -> Dict[str, str]:
    """
    Start an incremental sync of the SQLite index.

    Uses the Changes API to fetch only what changed since last sync.
    Much faster than a full crawl.

    Returns:
        Dict with scan_id to poll for status

    Raises:
        400: If no previous crawl exists (need full crawl first)
    """
    from .sync_changes import run_sync, can_sync, SyncProgress
    from .index_db import get_db_path

    db_path = get_db_path()

    if not can_sync(db_path):
        raise HTTPException(
            status_code=400,
            detail="Cannot sync: no previous crawl found. Run /api/index/crawl/start first.",
        )

    scan_id = str(uuid.uuid4())

    # Initialize state
    _sqlite_scan_states[scan_id] = {
        "status": "starting",
        "type": "sync",
        "progress": None,
        "result": None,
    }

    def run_sync_task():
        try:
            service = get_service()

            def progress_callback(progress: SyncProgress):
                _sqlite_scan_states[scan_id]["progress"] = progress.to_dict()
                _sqlite_scan_states[scan_id]["status"] = progress.stage

            progress = run_sync(service, progress_callback=progress_callback)

            _sqlite_scan_states[scan_id]["status"] = "complete"
            _sqlite_scan_states[scan_id]["result"] = progress.to_dict()

        except Exception as e:
            import traceback

            _sqlite_scan_states[scan_id]["status"] = "error"
            _sqlite_scan_states[scan_id]["error"] = str(e)
            perf_logger.error("index_sync", message=str(e))
            traceback.print_exc()

    thread = Thread(target=run_sync_task, daemon=True)
    thread.start()

    return {"scan_id": scan_id}


@app.get("/api/index/scan/status/{scan_id}")
async def get_index_scan_status(scan_id: str) -> Dict[str, Any]:
    """
    Get the status of a crawl or sync operation.

    Args:
        scan_id: The scan ID from crawl/start or sync/start

    Returns:
        Status and progress information
    """
    if scan_id not in _sqlite_scan_states:
        raise HTTPException(status_code=404, detail="Scan ID not found")

    state = _sqlite_scan_states[scan_id]
    return {
        "scan_id": scan_id,
        "status": state["status"],
        "type": state.get("type"),
        "progress": state.get("progress"),
        "result": state.get("result"),
        "error": state.get("error"),
    }


@app.get("/api/index/data", response_model=ScanResponse)
async def get_index_data() -> ScanResponse:
    """
    Get scan data from the SQLite index.

    This returns the same ScanResponse format as the legacy JSON cache,
    but reads from SQLite for consistency with the new architecture.

    Returns:
        ScanResponse with files, children_map, and stats

    Raises:
        404: If no index data available
    """
    from .queries import build_scan_response_data
    from .index_db import database_exists, get_db_path

    db_path = get_db_path()

    if not database_exists(db_path):
        raise HTTPException(
            status_code=404, detail="No index data available. Run a crawl first."
        )

    try:
        data = build_scan_response_data(db_path)

        # Convert to response models
        file_items = [FileItem(**f) for f in data["files"]]
        stats = DriveStats(**data["stats"])

        return ScanResponse(
            files=file_items, children_map=data["children_map"], stats=stats
        )

    except Exception as e:
        perf_logger.error("get_index_data", message=str(e))
        raise HTTPException(status_code=500, detail=f"Error reading index: {str(e)}")


@app.get("/api/index/health")
async def get_index_health() -> Dict[str, Any]:
    """
    Run health checks on the SQLite index.

    Returns:
        Health check results including stats, warnings, and errors
    """
    from .health_checks import run_all_health_checks
    from .index_db import database_exists, get_db_path

    db_path = get_db_path()

    if not database_exists(db_path):
        raise HTTPException(
            status_code=404, detail="No index available. Run a crawl first."
        )

    try:
        result = run_all_health_checks(db_path)
        return result.to_dict()

    except Exception as e:
        perf_logger.error("get_index_health", message=str(e))
        raise HTTPException(
            status_code=500, detail=f"Error running health checks: {str(e)}"
        )


@app.get("/api/index/duplicates")
async def get_index_duplicates(limit: int = 100, min_size: int = 0) -> Dict[str, Any]:
    """
    Get duplicate file groups from the SQLite index.

    Duplicates are files with the same MD5 hash and size.

    Args:
        limit: Maximum number of groups to return
        min_size: Minimum file size to consider (bytes)

    Returns:
        Dict with duplicate groups and total savings info
    """
    from .queries import (
        get_duplicate_groups,
        get_total_duplicate_savings,
        get_duplicate_files_detail,
    )
    from .index_db import database_exists, get_db_path, get_connection

    db_path = get_db_path()

    if not database_exists(db_path):
        raise HTTPException(
            status_code=404, detail="No index available. Run a crawl first."
        )

    try:
        with get_connection(db_path) as conn:
            groups = get_duplicate_groups(conn, min_size=min_size, limit=limit)
            savings = get_total_duplicate_savings(conn)

            # Add file details to each group
            for group in groups:
                group["files"] = get_duplicate_files_detail(conn, group["file_ids"])

        return {
            "groups": groups,
            "total_groups": savings["total_groups"],
            "total_duplicate_files": savings["total_duplicate_files"],
            "total_wasted_bytes": savings["total_wasted_bytes"],
            "total_wasted_gb": round(savings["total_wasted_bytes"] / (1024**3), 2),
        }

    except Exception as e:
        perf_logger.error("get_index_duplicates", message=str(e))
        raise HTTPException(
            status_code=500, detail=f"Error getting duplicates: {str(e)}"
        )


@app.delete("/api/index/clear")
async def clear_index() -> Dict[str, str]:
    """
    Clear the SQLite index database.

    This removes all indexed data. A new crawl will be required.

    Returns:
        Success message
    """
    from .index_db import clear_database, get_db_path

    try:
        clear_database(get_db_path())
        return {"message": "SQLite index cleared successfully"}

    except Exception as e:
        perf_logger.error("clear_index", message=str(e))
        raise HTTPException(status_code=500, detail=f"Error clearing index: {str(e)}")
