"""FastAPI application entry point."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any

from .auth import authenticate
from .drive_api import list_all_files, build_tree_structure
from .models import ScanResponse, HealthResponse, FileItem, DriveStats

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


@app.get("/api/scan", response_model=ScanResponse)
async def scan_drive() -> ScanResponse:
    """
    Scan entire Google Drive and return file structure.
    
    This endpoint:
    1. Fetches all files from Google Drive
    2. Builds parent-child tree structure
    3. Calculates folder sizes recursively
    4. Returns structured data for visualization
    
    Returns:
        ScanResponse with files, children_map, and stats
    """
    try:
        service = get_service()
        
        # Fetch all files
        all_files = list_all_files(service)
        
        if not all_files:
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
        
        # Build tree structure
        tree_data = build_tree_structure(all_files)
        
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
        
        return ScanResponse(
            files=file_items,
            children_map=tree_data['children_map'],
            stats=stats
        )
        
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Authentication error: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error scanning Drive: {str(e)}"
        )


@app.on_event("startup")
async def startup_event():
    """Initialize service on startup."""
    try:
        get_service()
        print("Google Drive service initialized successfully")
    except FileNotFoundError:
        print("Warning: credentials.json not found. API will fail until credentials are added.")
    except Exception as e:
        print(f"Warning: Could not initialize Drive service: {e}")
