"""FastAPI application entry point."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import uuid
import asyncio
from threading import Thread

from .auth import authenticate
from .drive_api import list_all_files, build_tree_structure, get_drive_overview, get_top_level_folders
from .models import (
    ScanResponse, HealthResponse, FileItem, DriveStats,
    QuickScanResponse, ScanProgress, FullScanStatusResponse
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

# Global service instance (initialized on first use)
_service = None

# In-memory scan state tracking (use Redis in production)
_scan_states: Dict[str, Dict[str, Any]] = {}


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
    
    Returns:
        QuickScanResponse with overview and top folders
    """
    try:
        print("Starting quick scan...")
        service = get_service()
        
        # Get Drive overview (1 API call)
        print("Fetching Drive overview...")
        overview = get_drive_overview(service)
        print("✓ Overview fetched")
        
        # Get top-level folders (1-2 API calls)
        print("Fetching top-level folders...")
        top_folders, estimated_total = get_top_level_folders(service)
        print(f"✓ Found {len(top_folders)} top-level folders")
        
        # Convert to FileItem models
        folder_items = [FileItem(**folder) for folder in top_folders]
        
        return QuickScanResponse(
            overview=overview,
            top_folders=folder_items,
            estimated_total_files=estimated_total
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
    try:
        _scan_states[scan_id]["status"] = "running"
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="fetching",
            progress=0.0,
            message="Starting scan..."
        )
        
        service = get_service()
        
        # Fetch all files with progress updates
        all_files = []
        page_token = None
        page_count = 0
        
        # First page to estimate
        first_results = service.files().list(
            q="trashed=false",
            pageSize=1000,
            fields="nextPageToken, files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink)",
        ).execute()
        
        first_files = first_results.get('files', [])
        all_files.extend(first_files)
        page_token = first_results.get('nextPageToken')
        page_count = 1
        
        # Estimate pages (conservative: at least current page count)
        estimated_pages = 1
        if page_token:
            # If there's a next page, estimate based on typical distribution
            estimated_pages = max(10, len(all_files) // 500)  # Rough estimate
        
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="fetching",
            progress=5.0,
            current_page=page_count,
            estimated_pages=estimated_pages,
            files_fetched=len(all_files),
            message=f"Fetched {len(all_files)} files..."
        )
        
        # Continue fetching pages
        while page_token:
            try:
                page_count += 1
                results = service.files().list(
                    q="trashed=false",
                    pageSize=1000,
                    fields="nextPageToken, files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink)",
                    pageToken=page_token
                ).execute()
                
                files = results.get('files', [])
                all_files.extend(files)
                page_token = results.get('nextPageToken')
                
                # Update progress (50% for fetching)
                progress_pct = min(50.0, (page_count / max(estimated_pages, page_count)) * 50)
                _scan_states[scan_id]["progress"] = ScanProgress(
                    scan_id=scan_id,
                    stage="fetching",
                    progress=progress_pct,
                    current_page=page_count,
                    estimated_pages=max(estimated_pages, page_count),
                    files_fetched=len(all_files),
                    message=f"Fetched {len(all_files)} files... (page {page_count})"
                )
                
            except Exception as e:
                print(f"Error fetching page {page_count}: {e}")
                break
        
        # Update: building tree (50-75%)
        _scan_states[scan_id]["progress"] = ScanProgress(
            scan_id=scan_id,
            stage="building_tree",
            progress=50.0,
            files_fetched=len(all_files),
            message="Building folder structure..."
        )
        
        # Build tree structure
        tree_data = build_tree_structure(all_files)
        
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
        
        print(f"✓ Full scan {scan_id} complete: {stats.total_files} items")
        
    except Exception as e:
        import traceback
        error_detail = str(e)
        print(f"Error in full scan {scan_id}: {error_detail}")
        print(traceback.format_exc())
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
    
    Returns:
        Dictionary with scan_id to poll for status
    """
    try:
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
        print(f"Error starting full scan: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error starting full scan: {error_detail}"
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
        print("Google Drive service initialized successfully")
    except FileNotFoundError:
        print("Warning: Google OAuth credentials not found. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars, or add credentials.json to project root.")
    except Exception as e:
        print(f"Warning: Could not initialize Drive service: {e}")
