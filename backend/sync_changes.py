"""Incremental sync algorithm using Google Drive Changes API.

This module implements incremental sync that:
1. Loads the stored start_page_token from the last sync
2. Fetches changes since that token via changes.list
3. For each change:
   - If removed=True: mark file removed, delete edges
   - Else: upsert file + replace parents
4. Stores the new start token for the next sync
5. Runs health checks

This is the key optimization over full re-crawls - after the initial crawl,
subsequent syncs only fetch what changed, making them near-instant for
drives that don't change frequently.
"""

import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from .drive_api import list_changes, get_start_page_token
from .index_db import (
    get_connection,
    get_db_path,
    upsert_file,
    replace_parents,
    mark_file_removed,
    set_sync_state,
    get_sync_state,
    log_file_error,
)
from .utils.logger import PerformanceLogger

# Performance logger
sync_logger = PerformanceLogger("sync_changes")


class SyncProgress:
    """Progress tracking for incremental sync."""

    def __init__(self):
        self.stage: str = "initializing"
        self.changes_fetched: int = 0
        self.changes_processed: int = 0
        self.total_changes: int = 0
        self.files_added: int = 0
        self.files_updated: int = 0
        self.files_removed: int = 0
        self.pages_fetched: int = 0
        self.errors: int = 0
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.message: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "stage": self.stage,
            "changes_fetched": self.changes_fetched,
            "changes_processed": self.changes_processed,
            "total_changes": self.total_changes,
            "files_added": self.files_added,
            "files_updated": self.files_updated,
            "files_removed": self.files_removed,
            "pages_fetched": self.pages_fetched,
            "errors": self.errors,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at else None
            ),
            "message": self.message,
            "progress_pct": self._progress_pct(),
        }

    def _progress_pct(self) -> float:
        if self.stage == "complete":
            return 100.0
        if self.stage == "fetching":
            return 30.0  # Can't estimate until we have all changes
        if self.stage == "processing":
            if self.total_changes == 0:
                return 50.0
            return 30.0 + (self.changes_processed / self.total_changes) * 60
        if self.stage == "finalizing":
            return 90.0
        return 0.0


def run_sync(
    service,
    db_path: Optional[Path] = None,
    progress_callback: Optional[Callable[[SyncProgress], None]] = None,
) -> SyncProgress:
    """
    Run an incremental sync using the Changes API.

    This applies all changes since the last sync/crawl to the local database.
    Much faster than a full crawl when few files have changed.

    Algorithm:
    1. Load start_page_token from sync_state
    2. Paginate through changes.list
    3. For each change:
       - If removed=True: mark file removed, delete edges
       - Else: upsert file + replace parents
    4. Store newStartPageToken
    5. Update last_sync_time

    Args:
        service: Authenticated Google Drive API service
        db_path: Optional path to database file
        progress_callback: Optional callback for progress updates

    Returns:
        SyncProgress with final state

    Raises:
        RuntimeError: If no start_page_token exists (need full crawl first)
    """
    progress = SyncProgress()
    progress.started_at = datetime.now(timezone.utc)
    start_time = time.perf_counter()

    path = db_path or get_db_path()

    def update_progress():
        if progress_callback:
            progress_callback(progress)

    try:
        # Stage 1: Load the start token
        progress.stage = "initializing"
        progress.message = "Loading sync token..."
        update_progress()

        with get_connection(path) as conn:
            start_token = get_sync_state(conn, "start_page_token")

        if not start_token:
            raise RuntimeError("No start_page_token found. Run a full crawl first.")

        sync_logger.info(
            "run_sync.start", token_prefix=start_token[:10] if start_token else None
        )

        # Stage 2: Fetch changes from Drive
        progress.stage = "fetching"
        progress.message = "Fetching changes from Google Drive..."
        update_progress()

        def fetch_progress(changes_count: int, page_count: int):
            progress.changes_fetched = changes_count
            progress.pages_fetched = page_count
            progress.message = f"Fetched {changes_count} changes..."
            update_progress()

        all_changes, new_start_token = list_changes(
            service, start_token, progress_callback=fetch_progress
        )

        progress.total_changes = len(all_changes)
        sync_logger.info(
            "run_sync.fetch_complete",
            changes=len(all_changes),
            pages=progress.pages_fetched,
        )

        # Stage 3: Process changes
        progress.stage = "processing"
        progress.message = "Processing changes..."
        update_progress()

        with get_connection(path) as conn:
            for i, change in enumerate(all_changes):
                try:
                    file_id = change.get("fileId")
                    removed = change.get("removed", False)

                    if removed:
                        # File was deleted or removed from view
                        if file_id:
                            mark_file_removed(conn, file_id)
                            progress.files_removed += 1
                    else:
                        # File was added or updated
                        file_dict = change.get("file")
                        if file_dict:
                            # Check if file already exists
                            cursor = conn.cursor()
                            cursor.execute(
                                "SELECT id FROM files WHERE id = ?", (file_id,)
                            )
                            existing = cursor.fetchone()

                            # Upsert the file
                            upsert_file(conn, file_dict)

                            # Update parent edges
                            parents = file_dict.get("parents", [])
                            replace_parents(conn, file_id, parents)

                            if existing:
                                progress.files_updated += 1
                            else:
                                progress.files_added += 1

                    progress.changes_processed = i + 1

                    # Commit periodically
                    if (i + 1) % 100 == 0:
                        conn.commit()
                        progress.message = (
                            f"Processed {i + 1}/{progress.total_changes} changes..."
                        )
                        update_progress()

                except Exception as e:
                    progress.errors += 1
                    log_file_error(conn, file_id, "sync", str(e))
                    sync_logger.error(
                        "run_sync.process_change", file_id=file_id, message=str(e)
                    )

            # Final commit
            conn.commit()

        sync_logger.info(
            "run_sync.process_complete",
            added=progress.files_added,
            updated=progress.files_updated,
            removed=progress.files_removed,
            errors=progress.errors,
        )

        # Stage 4: Store the new token
        progress.stage = "finalizing"
        progress.message = "Saving sync state..."
        update_progress()

        with get_connection(path) as conn:
            if new_start_token:
                set_sync_state(conn, "start_page_token", new_start_token)
            set_sync_state(
                conn, "last_sync_time", datetime.now(timezone.utc).isoformat()
            )
            conn.commit()

        # Stage 5: Complete
        progress.stage = "complete"
        progress.completed_at = datetime.now(timezone.utc)

        if progress.total_changes == 0:
            progress.message = "No changes detected"
        else:
            progress.message = (
                f"Sync complete: {progress.files_added} added, "
                f"{progress.files_updated} updated, "
                f"{progress.files_removed} removed"
            )
        update_progress()

        total_duration_ms = (time.perf_counter() - start_time) * 1000
        sync_logger.info(
            "run_sync.complete",
            duration_ms=total_duration_ms,
            changes=progress.total_changes,
            added=progress.files_added,
            updated=progress.files_updated,
            removed=progress.files_removed,
            errors=progress.errors,
        )

        return progress

    except Exception as e:
        progress.stage = "error"
        progress.message = f"Error: {str(e)}"
        progress.completed_at = datetime.now(timezone.utc)
        update_progress()

        total_duration_ms = (time.perf_counter() - start_time) * 1000
        sync_logger.error(
            "run_sync.error",
            duration_ms=total_duration_ms,
            message=str(e),
            changes_processed=progress.changes_processed,
        )

        import traceback

        traceback.print_exc()
        raise


def can_sync(db_path: Optional[Path] = None) -> bool:
    """
    Check if incremental sync is possible.

    Returns True if a start_page_token exists (meaning a full crawl was completed).

    Args:
        db_path: Optional path to database file

    Returns:
        True if sync is possible
    """
    from .index_db import database_exists

    path = db_path or get_db_path()

    if not database_exists(path):
        return False

    try:
        with get_connection(path) as conn:
            token = get_sync_state(conn, "start_page_token")
            return token is not None
    except Exception:
        return False


def get_last_sync_info(db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    """
    Get information about the last sync.

    Returns:
        Dict with sync info or None if never synced
    """
    from .index_db import database_exists

    path = db_path or get_db_path()

    if not database_exists(path):
        return None

    try:
        with get_connection(path) as conn:
            last_sync = get_sync_state(conn, "last_sync_time")
            last_crawl = get_sync_state(conn, "last_full_crawl_time")
            token = get_sync_state(conn, "start_page_token")

            return {
                "last_sync_time": last_sync,
                "last_full_crawl_time": last_crawl,
                "has_token": token is not None,
            }
    except Exception:
        return None


def smart_sync(
    service,
    db_path: Optional[Path] = None,
    progress_callback: Optional[Callable] = None,
    force_full_crawl: bool = False,
) -> Dict[str, Any]:
    """
    Smart sync that chooses between full crawl and incremental sync.

    - If database doesn't exist or no token: run full crawl
    - Otherwise: run incremental sync

    Args:
        service: Authenticated Google Drive API service
        db_path: Optional path to database file
        progress_callback: Optional callback for progress updates
        force_full_crawl: Force a full crawl even if sync is possible

    Returns:
        Dict with sync result info
    """
    from .crawl_full import run_full_crawl, needs_full_crawl

    path = db_path or get_db_path()

    if force_full_crawl or needs_full_crawl(path):
        sync_logger.info("smart_sync", message="Running full crawl")
        progress = run_full_crawl(service, path, progress_callback=progress_callback)
        return {
            "type": "full_crawl",
            "progress": progress.to_dict(),
        }
    else:
        sync_logger.info("smart_sync", message="Running incremental sync")
        progress = run_sync(service, path, progress_callback=progress_callback)
        return {
            "type": "incremental_sync",
            "progress": progress.to_dict(),
        }
