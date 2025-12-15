"""FastAPI application entry point."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, Optional
import uuid
import asyncio
import time
from threading import Thread

from .auth import authenticate
from .drive_api import list_all_files, build_tree_structure, get_drive_overview, get_top_level_folders
from .utils.logger import PerformanceLogger, log_timing, log_operation
from .models import (
    ScanResponse, HealthResponse, FileItem, DriveStats,
    QuickScanResponse, ScanProgress, FullScanStatusResponse
)
from .cache import (
    load_cache, save_cache, is_cache_valid_time_based,
    get_cache_metadata, CacheMetadata, validate_cache_with_drive, clear_cache
)

app = FastAPI(
    title="Google Drive Manager API",
    description="API for scanning and visualizing Google Drive structure",
    version="1.0.0"
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite default port
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
        cache_data = load_cache('quick_scan')
        if cache_data:
            metadata = CacheMetadata(**cache_data['metadata'])
            service = get_service()
            # Quick scan uses smart validation: 7 days TTL + Drive API check
            # Since files rarely change, we can extend cache significantly
            if validate_cache_with_drive(service, metadata, max_age_seconds=604800):  # 7 days initial TTL
                log_operation("quick_scan.cache_hit", logger_name="main")
                # Convert cached data back to QuickScanResponse
                cached_response = cache_data['data']
                return QuickScanResponse(**cached_response)
            else:
                log_operation("quick_scan.cache_miss", logger_name="main", reason="drive_changed")
        
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
            estimated_total_files=estimated_total
        )
        
        # Cache the result
        from datetime import datetime, timezone
        metadata = CacheMetadata(
            timestamp=datetime.now(timezone.utc).isoformat(),
            file_count=len(folder_items),
            total_size=None,
            cache_version=1
        )
        # Convert response to dict for caching
        response_dict = response.model_dump()
        save_cache('quick_scan', response_dict, metadata)
        
        total_duration_ms = (time.perf_counter() - scan_start) * 1000
        perf_logger.info(
            "quick_scan",
            duration_ms=total_duration_ms,
            folders=len(folder_items),
            estimated_total=estimated_total
        )
        
        return response
        
    except FileNotFoundError as e:
        if "credentials" in str(e).lower():
            raise HTTPException(
                status_code=500,
                detail=str(e) + " See CREDENTIALS_SETUP.md or SETUP.md for setup instructions."
            )
        raise HTTPException(
            status_code=500,
            detail=f"Authentication error: {str(e)}"
        )
    except OSError as e:
        # Network-related errors (connection refused, address in use, etc.)
        error_msg = str(e)
        if "Errno 49" in error_msg or "Can't assign requested address" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Network connection error: Unable to connect to Google Drive API. This may be a temporary network issue. Please check your internet connection and try again in a few moments."
            )
        elif "Errno 61" in error_msg or "Connection refused" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Network connection error: Connection to Google Drive API was refused. Please check your internet connection and try again."
            )
        else:
            raise HTTPException(
                status_code=503,
                detail=f"Network error: {error_msg}. Please check your internet connection and try again."
            )
    except Exception as e:
        import traceback
        error_detail = str(e)
        print(f"Error in quick scan: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error in quick scan: {error_detail}"
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
                    total_files=0,
                    total_size=0,
                    folder_count=0,
                    file_count=0
                )
            )
        
        print("Step 3/4: Building folder structure and calculating sizes...")
        # Build tree structure
        tree_data = build_tree_structure(all_files)
        print("✓ Tree structure built")
        
        print("Step 4/4: Calculating statistics...")
        # Calculate statistics
        folders = [
            f for f in all_files 
            if f['mimeType'] == 'application/vnd.google-apps.folder'
        ]
        files_only = [
            f for f in all_files 
            if f['mimeType'] != 'application/vnd.google-apps.folder'
        ]
        
        # Calculate total size
        total_size = sum(
            int(f.get('calculatedSize') or f.get('size') or 0)
            for f in all_files
        )
        
        stats = DriveStats(
            total_files=len(all_files),
            total_size=total_size,
            folder_count=len(folders),
            file_count=len(files_only)
        )
        
        # Convert files to FileItem models
        file_items = [FileItem(**file) for file in tree_data['files']]
        
        print(f"✓ Scan complete: {stats.total_files} items, {stats.total_size / (1024**3):.2f} GB")
        
        return ScanResponse(
            files=file_items,
            children_map=tree_data['children_map'],
            stats=stats
        )
        
    except FileNotFoundError as e:
        if "credentials" in str(e).lower():
            raise HTTPException(
                status_code=500,
                detail=str(e) + " See CREDENTIALS_SETUP.md or SETUP.md for setup instructions."
            )
        raise HTTPException(
            status_code=500,
            detail=f"Authentication error: {str(e)}"
        )
    except OSError as e:
        # Network-related errors (connection refused, address in use, etc.)
        error_msg = str(e)
        if "Errno 49" in error_msg or "Can't assign requested address" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Network connection error: Unable to connect to Google Drive API. This may be a temporary network issue. Please check your internet connection and try again in a few moments."
            )
        elif "Errno 61" in error_msg or "Connection refused" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Network connection error: Connection to Google Drive API was refused. Please check your internet connection and try again."
            )
        else:
            raise HTTPException(
                status_code=503,
                detail=f"Network error: {error_msg}. Please check your internet connection and try again."
            )
    except Exception as e:
        import traceback
        error_detail = str(e)
        # Log full traceback for debugging
        print(f"Error scanning Drive: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error scanning Drive: {error_detail}"
        )


def run_full_scan(scan_id: str):
    """Run full scan in background thread."""
    scan_start = time.perf_counter()
    
    # Ensure scan state exists before starting
    if scan_id not in _scan_states:
        _scan_states[scan_id] = {
            "status": "starting",
            "progress": None,
            "result": None
        }
    
    try:
        log_operation("full_scan.start", logger_name="main", scan_id=scan_id)
        _scan_states[scan_id]["status"] = "running"
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="fetching",
            progress=0.0,
            message="Starting scan..."
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
            message=f"Fetched {len(all_files)} files..."
        )
        
        fetch_duration_ms = (time.perf_counter() - fetch_start) * 1000
        perf_logger.info(
            "full_scan.fetching",
            duration_ms=fetch_duration_ms,
            files=len(all_files),
            scan_id=scan_id
        )
        
        # Update: building tree (50-75%)
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="building_tree",
            progress=50.0,
            files_fetched=len(all_files),
            message="Building folder structure..."
        )
        
        # Build tree structure
        tree_start = time.perf_counter()
        tree_data = build_tree_structure(all_files)
        tree_duration_ms = (time.perf_counter() - tree_start) * 1000
        perf_logger.info(
            "full_scan.building_tree",
            duration_ms=tree_duration_ms,
            files=len(all_files),
            scan_id=scan_id
        )
        
        # Update: calculating sizes (75-95%)
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="calculating_sizes",
            progress=75.0,
            files_fetched=len(all_files),
            message="Calculating folder sizes..."
        )
        
        # Calculate statistics
        folders = [f for f in all_files if f['mimeType'] == 'application/vnd.google-apps.folder']
        files_only = [f for f in all_files if f['mimeType'] != 'application/vnd.google-apps.folder']
        total_size = sum(int(f.get('calculatedSize') or f.get('size') or 0) for f in all_files)
        
        stats = DriveStats(
            total_files=len(all_files),
            total_size=total_size,
            folder_count=len(folders),
            file_count=len(files_only)
        )
        
        # Convert to FileItem models
        file_items = [FileItem(**file) for file in tree_data['files']]
        
        result = ScanResponse(
            files=file_items,
            children_map=tree_data['children_map'],
            stats=stats
        )
        
        # Mark as complete
        _scan_states[scan_id]["status"] = "complete"
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="complete",
            progress=100.0,
            files_fetched=len(all_files),
            message="Scan complete!"
        )
        _scan_states[scan_id]["result"] = result
        
        # Cache the result
        cache_start = time.perf_counter()
        from datetime import datetime, timezone
        metadata = CacheMetadata(
            timestamp=datetime.now(timezone.utc).isoformat(),
            file_count=stats.total_files,
            total_size=stats.total_size,
            cache_version=1
        )
        # Convert result to dict for caching
        result_dict = result.model_dump()
        save_cache('full_scan', result_dict, metadata)
        cache_duration_ms = (time.perf_counter() - cache_start) * 1000
        
        total_duration_ms = (time.perf_counter() - scan_start) * 1000
        perf_logger.info(
            "full_scan.complete",
            duration_ms=total_duration_ms,
            files=stats.total_files,
            folders=stats.folder_count,
            size_gb=stats.total_size / (1024**3),
            cache_duration_ms=cache_duration_ms,
            scan_id=scan_id
        )
        
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
            "full_scan.network_error",
            message=error_detail,
            scan_id=scan_id
        )
        
        # Ensure scan state exists before updating error status
        if scan_id not in _scan_states:
            _scan_states[scan_id] = {
                "status": "error",
                "progress": None,
                "result": None
            }
        
        _scan_states[scan_id]["status"] = "error"
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="error",
            progress=0.0,
            message=error_detail
        )
    except Exception as e:
        import traceback
        error_detail = str(e)
        perf_logger.error(
            "full_scan.error",
            message=f"Error in full scan: {error_detail}",
            scan_id=scan_id
        )
        print(traceback.format_exc())
        
        # Ensure scan state exists before updating error status
        if scan_id not in _scan_states:
            _scan_states[scan_id] = {
                "status": "error",
                "progress": None,
                "result": None
            }
        
        _scan_states[scan_id]["status"] = "error"
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="error",
            progress=0.0,
            message=f"Error: {error_detail}"
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
        cache_data = load_cache('full_scan')
        if cache_data:
            metadata = CacheMetadata(**cache_data['metadata'])
            service = get_service()
            # Full scan uses smart validation: 30 days initial TTL + Drive API check
            # Since files rarely change, cache can persist indefinitely until files actually change
            if validate_cache_with_drive(service, metadata, max_age_seconds=2592000):  # 30 days initial TTL
                # Create a scan_id and immediately mark as complete with cached result
                scan_id = str(uuid.uuid4())
                log_operation("full_scan.cache_hit", logger_name="main", scan_id=scan_id)
                cached_response = cache_data['data']
                result = ScanResponse(**cached_response)
                
                # Initialize scan state as complete
                _scan_states[scan_id] = {
                    "status": "complete",
                    "progress": ScanProgress(
                        scan_id=scan_id,
                        stage="complete",
                        progress=100.0,
                        files_fetched=result.stats.total_files,
                        message="Scan complete! (from cache)"
                    ),
                    "result": result
                }
                return {"scan_id": scan_id}
            else:
                log_operation("full_scan.cache_miss", logger_name="main", reason="invalid_or_expired")
        
        scan_id = str(uuid.uuid4())
        
        # Initialize scan state
        _scan_states[scan_id] = {
            "status": "starting",
            "progress": None,
            "result": None
        }
        
        # Start scan in background thread
        thread = Thread(target=run_full_scan, args=(scan_id,), daemon=True)
        thread.start()
        
        return {"scan_id": scan_id}
        
    except Exception as e:
        import traceback
        error_detail = str(e)
        perf_logger.error(
            "start_full_scan",
            message=f"Error starting full scan: {error_detail}"
        )
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error starting full scan: {error_detail}"
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
            raise HTTPException(
                status_code=500,
                detail="Failed to clear cache"
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error clearing cache: {str(e)}"
        )


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
            message="Initializing scan..."
        )
    
    return FullScanStatusResponse(
        scan_id=scan_id,
        status=state["status"],
        progress=progress,
        result=state.get("result")
    )


@app.on_event("startup")
async def startup_event():
    """Initialize service on startup."""
    try:
        get_service()
        log_operation("startup.service_init", logger_name="main", status="success")
    except FileNotFoundError:
        perf_logger.warning("startup.service_init", message="Google OAuth credentials not found. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars, or add credentials.json to project root.")
    except Exception as e:
        perf_logger.warning("startup.service_init", message=f"Could not initialize Drive service: {str(e)}")
