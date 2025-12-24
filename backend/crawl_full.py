"""Full crawl algorithm for Google Drive indexing.

This module implements the initial full crawl that:
1. Enumerates all files via files.list with comprehensive metadata
2. Stores each file in SQLite with normalized columns + raw JSON
3. Builds the parent-child edge table
4. Gets and stores the Changes API start token for future incremental sync
5. Runs health checks to validate data integrity

The crawl is idempotent - re-running converges to the same state.
"""
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from .drive_api import list_all_files_full, get_start_page_token
from .index_db import (
    get_connection,
    get_db_path,
    init_db,
    upsert_file,
    replace_parents,
    set_sync_state,
    get_sync_state,
    log_file_error,
)
from .utils.logger import PerformanceLogger

# Performance logger
crawl_logger = PerformanceLogger("crawl_full")


class CrawlProgress:
    """Progress tracking for full crawl."""
    
    def __init__(self):
        self.stage: str = "initializing"
        self.files_fetched: int = 0
        self.files_processed: int = 0
        self.total_files: int = 0
        self.pages_fetched: int = 0
        self.errors: int = 0
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.message: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "stage": self.stage,
            "files_fetched": self.files_fetched,
            "files_processed": self.files_processed,
            "total_files": self.total_files,
            "pages_fetched": self.pages_fetched,
            "errors": self.errors,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "message": self.message,
            "progress_pct": self._progress_pct(),
        }
    
    def _progress_pct(self) -> float:
        if self.stage == "complete":
            return 100.0
        if self.stage == "fetching":
            # Estimate based on files fetched (assume ~5000 files typical)
            return min(40.0, (self.files_fetched / 5000) * 40)
        if self.stage == "processing":
            if self.total_files == 0:
                return 50.0
            return 40.0 + (self.files_processed / self.total_files) * 50
        if self.stage == "finalizing":
            return 90.0
        return 0.0


def run_full_crawl(
    service,
    db_path: Optional[Path] = None,
    include_trashed: bool = False,
    progress_callback: Optional[Callable[[CrawlProgress], None]] = None,
) -> CrawlProgress:
    """
    Run a full crawl of Google Drive.
    
    This is the main entry point for building the local index from scratch.
    
    Algorithm:
    1. Initialize database if needed
    2. Paginate through files.list with FULL_FIELDS
    3. For each file: upsert_file() + replace_parents()
    4. Get and store startPageToken for future incremental sync
    5. Store crawl metadata (timestamp, file count)
    
    Args:
        service: Authenticated Google Drive API service
        db_path: Optional path to database file
        include_trashed: Whether to include trashed files
        progress_callback: Optional callback for progress updates
        
    Returns:
        CrawlProgress with final state
    """
    progress = CrawlProgress()
    progress.started_at = datetime.now(timezone.utc)
    start_time = time.perf_counter()
    
    path = db_path or get_db_path()
    
    def update_progress():
        if progress_callback:
            progress_callback(progress)
    
    try:
        # Stage 1: Initialize database
        progress.stage = "initializing"
        progress.message = "Initializing database..."
        update_progress()
        
        init_db(path)
        crawl_logger.info("run_full_crawl.init", message="Database initialized")
        
        # Stage 2: Fetch all files from Drive
        progress.stage = "fetching"
        progress.message = "Fetching files from Google Drive..."
        update_progress()
        
        def fetch_progress(files_count: int, page_count: int):
            progress.files_fetched = files_count
            progress.pages_fetched = page_count
            progress.message = f"Fetched {files_count} files ({page_count} pages)..."
            update_progress()
        
        all_files = list_all_files_full(
            service,
            include_trashed=include_trashed,
            progress_callback=fetch_progress
        )
        
        progress.total_files = len(all_files)
        crawl_logger.info(
            "run_full_crawl.fetch_complete",
            files=len(all_files),
            pages=progress.pages_fetched
        )
        
        # Stage 3: Process files into database
        progress.stage = "processing"
        progress.message = "Processing files into database..."
        update_progress()
        
        with get_connection(path) as conn:
            cursor = conn.cursor()
            
            # Process in batches for better performance
            batch_size = 500
            for i, file_dict in enumerate(all_files):
                try:
                    # Upsert the file record
                    upsert_file(conn, file_dict)
                    
                    # Update parent edges
                    file_id = file_dict.get("id")
                    parents = file_dict.get("parents", [])
                    if file_id:
                        replace_parents(conn, file_id, parents)
                    
                    progress.files_processed = i + 1
                    
                    # Commit in batches
                    if (i + 1) % batch_size == 0:
                        conn.commit()
                        progress.message = f"Processed {i + 1}/{progress.total_files} files..."
                        update_progress()
                        
                except Exception as e:
                    progress.errors += 1
                    file_id = file_dict.get("id", "unknown")
                    log_file_error(conn, file_id, "crawl", str(e))
                    crawl_logger.error(
                        "run_full_crawl.process_file",
                        file_id=file_id,
                        message=str(e)
                    )
            
            # Final commit
            conn.commit()
        
        crawl_logger.info(
            "run_full_crawl.process_complete",
            files_processed=progress.files_processed,
            errors=progress.errors
        )
        
        # Stage 4: Get and store the start page token for incremental sync
        progress.stage = "finalizing"
        progress.message = "Getting sync token..."
        update_progress()
        
        start_token = get_start_page_token(service)
        
        with get_connection(path) as conn:
            set_sync_state(conn, "start_page_token", start_token)
            set_sync_state(conn, "last_full_crawl_time", datetime.now(timezone.utc).isoformat())
            set_sync_state(conn, "last_sync_time", datetime.now(timezone.utc).isoformat())
            set_sync_state(conn, "file_count", str(progress.total_files))
            conn.commit()
        
        # Stage 5: Complete
        progress.stage = "complete"
        progress.completed_at = datetime.now(timezone.utc)
        progress.message = f"Crawl complete: {progress.total_files} files indexed"
        update_progress()
        
        total_duration_ms = (time.perf_counter() - start_time) * 1000
        crawl_logger.info(
            "run_full_crawl.complete",
            duration_ms=total_duration_ms,
            files=progress.total_files,
            errors=progress.errors
        )
        
        return progress
        
    except Exception as e:
        progress.stage = "error"
        progress.message = f"Error: {str(e)}"
        progress.completed_at = datetime.now(timezone.utc)
        update_progress()
        
        total_duration_ms = (time.perf_counter() - start_time) * 1000
        crawl_logger.error(
            "run_full_crawl.error",
            duration_ms=total_duration_ms,
            message=str(e),
            files_processed=progress.files_processed
        )
        
        import traceback
        traceback.print_exc()
        raise


def needs_full_crawl(db_path: Optional[Path] = None) -> bool:
    """
    Check if a full crawl is needed.
    
    Returns True if:
    - Database doesn't exist
    - No start_page_token stored (never completed a crawl)
    
    Args:
        db_path: Optional path to database file
        
    Returns:
        True if full crawl is needed
    """
    from .index_db import database_exists
    
    path = db_path or get_db_path()
    
    if not database_exists(path):
        return True
    
    try:
        with get_connection(path) as conn:
            token = get_sync_state(conn, "start_page_token")
            return token is None
    except Exception:
        return True


def get_last_crawl_info(db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    """
    Get information about the last crawl.
    
    Returns:
        Dict with crawl info or None if never crawled
    """
    from .index_db import database_exists, get_file_count
    
    path = db_path or get_db_path()
    
    if not database_exists(path):
        return None
    
    try:
        with get_connection(path) as conn:
            last_crawl = get_sync_state(conn, "last_full_crawl_time")
            last_sync = get_sync_state(conn, "last_sync_time")
            file_count = get_file_count(conn)
            
            if not last_crawl:
                return None
            
            return {
                "last_full_crawl_time": last_crawl,
                "last_sync_time": last_sync,
                "file_count": file_count,
            }
    except Exception:
        return None
