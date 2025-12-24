"""Core Google Drive API operations."""
from collections import defaultdict
from typing import Dict, List, Any, Optional, Tuple, Callable
from datetime import datetime, timezone
import time
from .utils.logger import timed_operation, log_timing, PerformanceLogger

# Performance logger for drive_api operations
perf_logger = PerformanceLogger("drive_api")

# Comprehensive fields for full metadata capture (per SPECIFICATION.md)
# This captures all fields needed for:
# - Duplicate detection (md5Checksum, size)
# - Shortcuts (shortcutDetails)
# - Capabilities for future actions
# - Owner info for filtering
FULL_FIELDS = (
    "nextPageToken, files("
    "id, name, mimeType, parents, trashed, createdTime, modifiedTime, "
    "size, md5Checksum, ownedByMe, "
    "owners(displayName, emailAddress, permissionId), "
    "capabilities(canTrash, canDelete, canMoveItemWithinDrive, "
    "canRemoveChildren, canAddChildren, canRename, canShare), "
    "shortcutDetails(targetId, targetMimeType), "
    "starred, webViewLink, iconLink"
    ")"
)

# Fields for Changes API responses
CHANGES_FIELDS = (
    "nextPageToken, newStartPageToken, "
    "changes(fileId, removed, file("
    "id, name, mimeType, parents, trashed, createdTime, modifiedTime, "
    "size, md5Checksum, ownedByMe, "
    "owners(displayName, emailAddress, permissionId), "
    "capabilities(canTrash, canDelete, canMoveItemWithinDrive, "
    "canRemoveChildren, canAddChildren, canRename, canShare), "
    "shortcutDetails(targetId, targetMimeType), "
    "starred, webViewLink, iconLink"
    "))"
)

# Minimal fields for backward compatibility with existing code
MINIMAL_FIELDS = "nextPageToken, files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink)"


def list_all_files(service) -> List[Dict[str, Any]]:
    """
    Fetch all files from Google Drive.
    
    Args:
        service: Authenticated Google Drive API service
        
    Returns:
        List of file dictionaries with metadata
    """
    all_files = []
    page_token = None
    page_count = 0
    start_time = time.perf_counter()
    
    while True:
        try:
            page_count += 1
            page_start = time.perf_counter()
            
            results = service.files().list(
                q="trashed=false",
                pageSize=1000,
                fields="nextPageToken, files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink)",
                pageToken=page_token
            ).execute()
            
            page_duration_ms = (time.perf_counter() - page_start) * 1000
            
            files = results.get('files', [])
            all_files.extend(files)
            page_token = results.get('nextPageToken')
            
            # Log every 10 pages or on slow pages
            if page_count % 10 == 0 or page_duration_ms > 1000:
                perf_logger.info(
                    "list_all_files.page_fetch",
                    duration_ms=page_duration_ms,
                    page=page_count,
                    files_so_far=len(all_files)
                )
            
            if not page_token:
                break
                
        except Exception as e:
            total_duration_ms = (time.perf_counter() - start_time) * 1000
            perf_logger.error(
                "list_all_files",
                duration_ms=total_duration_ms,
                message=f"Error fetching page {page_count}: {str(e)}",
                pages_fetched=page_count,
                files_fetched=len(all_files)
            )
            import traceback
            traceback.print_exc()
            break
    
    total_duration_ms = (time.perf_counter() - start_time) * 1000
    perf_logger.info(
        "list_all_files",
        duration_ms=total_duration_ms,
        files=len(all_files),
        pages=page_count
    )
    
    return all_files


def build_tree_structure(all_files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build parent-child relationships and calculate folder sizes.
    
    Args:
        all_files: List of file dictionaries from Drive API
        
    Returns:
        Dictionary with:
        - files: List of all files with calculated sizes
        - file_map: Dictionary mapping file_id to file
        - children_map: Dictionary mapping parent_id to list of child_ids
    """
    start_time = time.perf_counter()
    
    with log_timing("build_tree_structure.build_maps", files=len(all_files)):
        file_map = {f['id']: f for f in all_files}
        children_map = defaultdict(list)
        
        # Build parent-child relationships
        for file in all_files:
            parents = file.get('parents', [])
            for parent in parents:
                children_map[parent].append(file['id'])
    
    # Calculate folder sizes recursively
    def calc_size(file_id: str) -> int:
        """Recursively calculate size of file or folder."""
        file = file_map.get(file_id)
        if not file:
            return 0
        
        # Files have direct size
        if file['mimeType'] != 'application/vnd.google-apps.folder':
            size = file.get('size', '0')
            return int(size) if size else 0
        
        # Folders need to sum children
        total = 0
        for child_id in children_map.get(file_id, []):
            total += calc_size(child_id)
        
        # Store calculated size in file dict
        file['calculatedSize'] = total
        return total
    
    with log_timing("build_tree_structure.calc_sizes"):
        # Calculate sizes for all root items (items with no parents)
        roots = [f for f in all_files if not f.get('parents')]
        for root in roots:
            calc_size(root['id'])
        
        # Also calculate sizes for folders that might not be roots
        # but weren't processed (in case of shared folders)
        folders = [
            f for f in all_files 
            if f['mimeType'] == 'application/vnd.google-apps.folder'
        ]
        folders_calculated = 0
        for folder in folders:
            if 'calculatedSize' not in folder:
                calc_size(folder['id'])
                folders_calculated += 1
    
    total_duration_ms = (time.perf_counter() - start_time) * 1000
    folder_count = len([f for f in all_files if f['mimeType'] == 'application/vnd.google-apps.folder'])
    
    perf_logger.info(
        "build_tree_structure",
        duration_ms=total_duration_ms,
        files=len(all_files),
        folders=folder_count
    )
    
    return {
        'files': all_files,
        'file_map': file_map,
        'children_map': dict(children_map)
    }


def get_file_metadata(service, file_id: str) -> Dict[str, Any]:
    """
    Get detailed metadata for a specific file.
    
    Args:
        service: Authenticated Google Drive API service
        file_id: ID of the file to retrieve
        
    Returns:
        File metadata dictionary
    """
    return service.files().get(
        fileId=file_id,
        fields="*"
    ).execute()


def get_drive_overview(service) -> Dict[str, Any]:
    """
    Get quick overview of Drive using about.get endpoint.
    
    Args:
        service: Authenticated Google Drive API service
        
    Returns:
        Dictionary with storage quota and user info
    """
    about = service.about().get(
        fields="storageQuota,user"
    ).execute()
    
    storage_quota = about.get('storageQuota', {})
    user = about.get('user', {})
    
    return {
        "total_quota": storage_quota.get('limit'),
        "used": storage_quota.get('usage'),
        "used_in_drive": storage_quota.get('usageInDrive'),
        "user_email": user.get('emailAddress'),
        "user_display_name": user.get('displayName')
    }


def get_top_level_folders(service) -> tuple[List[Dict[str, Any]], Optional[int]]:
    """
    Get only top-level folders (folders in root).
    
    Args:
        service: Authenticated Google Drive API service
        
    Returns:
        Tuple of (list of folder dicts, estimated total files count)
    """
    start_time = time.perf_counter()
    folders = []
    page_token = None
    estimated_total = None
    
    # First, get a sample to estimate total files
    with log_timing("get_top_level_folders.estimate"):
        first_page = service.files().list(
            q="trashed=false",
            pageSize=1000,
            fields="nextPageToken, files(id)"
        ).execute()
        
        # Estimate: if there's a nextPageToken, there are at least 1000 files
        # We can't know exact count without fetching all, but we can estimate
        if first_page.get('nextPageToken'):
            # Conservative estimate: at least 1000, likely more
            estimated_total = 1000  # Will be refined as we scan
    
    # Now get top-level folders
    with log_timing("get_top_level_folders.fetch"):
        while True:
            try:
                results = service.files().list(
                    q="trashed=false and mimeType='application/vnd.google-apps.folder' and 'root' in parents",
                    pageSize=1000,
                    fields="nextPageToken, files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink)",
                    pageToken=page_token
                ).execute()
                
                files = results.get('files', [])
                folders.extend(files)
                page_token = results.get('nextPageToken')
                
                if not page_token:
                    break
                    
            except Exception as e:
                total_duration_ms = (time.perf_counter() - start_time) * 1000
                perf_logger.error(
                    "get_top_level_folders",
                    duration_ms=total_duration_ms,
                    message=f"Error fetching folders: {str(e)}",
                    folders_fetched=len(folders)
                )
                break
    
    # For quick scan, we skip size calculation to keep it fast
    # Sizes will be calculated during full scan
    # Set calculatedSize to 0 for now
    for folder in folders:
        folder['calculatedSize'] = 0
    
    total_duration_ms = (time.perf_counter() - start_time) * 1000
    perf_logger.info(
        "get_top_level_folders",
        duration_ms=total_duration_ms,
        folders=len(folders),
        estimated_total=estimated_total
    )
    
    return folders, estimated_total


def check_recently_modified(service, since_timestamp: datetime, limit: int = 1) -> List[Dict[str, Any]]:
    """
    Check for files modified since a given timestamp.
    
    Optimized for cache validation - only needs to know if ANY file changed.
    Since drives rarely change, this is a fast check (single API call).
    
    This is used for cache invalidation - if any files have been modified
    since the cache was created, the cache should be invalidated.
    
    Args:
        service: Authenticated Google Drive API service
        since_timestamp: Datetime to check for modifications after
        limit: Maximum number of recent files to return (default: 1 for efficiency)
        
    Returns:
        List of recently modified file dictionaries (empty if none found)
        For cache validation, we only need to know if the list is empty or not
    """
    start_time = time.perf_counter()
    try:
        # Format timestamp for Drive API query (RFC 3339 format)
        # Drive API expects format: YYYY-MM-DDTHH:MM:SS
        timestamp_str = since_timestamp.strftime('%Y-%m-%dT%H:%M:%S')
        
        # Query for files modified after the timestamp, ordered by modification time
        # pageSize=1 is enough - we just need to know if ANY file changed
        results = service.files().list(
            q=f"trashed=false and modifiedTime > '{timestamp_str}'",
            orderBy="modifiedTime desc",
            pageSize=limit,  # Only need 1 to know if anything changed
            fields="nextPageToken, files(id, name, modifiedTime)"  # Minimal fields for speed
        ).execute()
        
        files = results.get('files', [])
        duration_ms = (time.perf_counter() - start_time) * 1000
        perf_logger.info(
            "check_recently_modified",
            duration_ms=duration_ms,
            files_found=len(files),
            since=since_timestamp.isoformat()[:10],  # Just the date for logging
            cache_age_days=round((datetime.now(timezone.utc) - since_timestamp).total_seconds() / 86400, 1)
        )
        return files
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        perf_logger.error(
            "check_recently_modified",
            duration_ms=duration_ms,
            message=f"Error: {str(e)}"
        )
        # Return empty list on error - we'll fall back to time-based validation
        return []


# =============================================================================
# New functions for SQLite indexer (per SPECIFICATION.md)
# =============================================================================

def list_all_files_full(
    service,
    include_trashed: bool = False,
    progress_callback: Optional[Callable[[int, int], None]] = None
) -> List[Dict[str, Any]]:
    """
    Fetch all files from Google Drive with comprehensive metadata.
    
    Uses FULL_FIELDS to capture all metadata needed for:
    - Duplicate detection (md5Checksum)
    - Shortcut handling
    - Capability-aware actions
    
    Args:
        service: Authenticated Google Drive API service
        include_trashed: Whether to include trashed files (default: False)
        progress_callback: Optional callback(files_fetched, page_count) for progress
        
    Returns:
        List of file dictionaries with full metadata
    """
    all_files = []
    page_token = None
    page_count = 0
    start_time = time.perf_counter()
    
    # Build query
    query = None if include_trashed else "trashed=false"
    
    while True:
        try:
            page_count += 1
            page_start = time.perf_counter()
            
            request_params = {
                "pageSize": 1000,
                "fields": FULL_FIELDS,
                "corpora": "user",
                "spaces": "drive",
                "includeItemsFromAllDrives": False,
                "supportsAllDrives": False,
            }
            if query:
                request_params["q"] = query
            if page_token:
                request_params["pageToken"] = page_token
            
            results = service.files().list(**request_params).execute()
            
            page_duration_ms = (time.perf_counter() - page_start) * 1000
            
            files = results.get('files', [])
            all_files.extend(files)
            page_token = results.get('nextPageToken')
            
            # Call progress callback if provided
            if progress_callback:
                progress_callback(len(all_files), page_count)
            
            # Log every 10 pages or on slow pages
            if page_count % 10 == 0 or page_duration_ms > 1000:
                perf_logger.info(
                    "list_all_files_full.page_fetch",
                    duration_ms=page_duration_ms,
                    page=page_count,
                    files_so_far=len(all_files)
                )
            
            if not page_token:
                break
                
        except Exception as e:
            total_duration_ms = (time.perf_counter() - start_time) * 1000
            perf_logger.error(
                "list_all_files_full",
                duration_ms=total_duration_ms,
                message=f"Error fetching page {page_count}: {str(e)}",
                pages_fetched=page_count,
                files_fetched=len(all_files)
            )
            import traceback
            traceback.print_exc()
            raise
    
    total_duration_ms = (time.perf_counter() - start_time) * 1000
    perf_logger.info(
        "list_all_files_full",
        duration_ms=total_duration_ms,
        files=len(all_files),
        pages=page_count
    )
    
    return all_files


def get_start_page_token(service) -> str:
    """
    Get the initial page token for the Changes API.
    
    This token represents the current state of the Drive.
    Store this after a full crawl to enable incremental sync.
    
    Args:
        service: Authenticated Google Drive API service
        
    Returns:
        Start page token string
    """
    start_time = time.perf_counter()
    try:
        response = service.changes().getStartPageToken(
            supportsAllDrives=False
        ).execute()
        
        token = response.get('startPageToken')
        duration_ms = (time.perf_counter() - start_time) * 1000
        perf_logger.info(
            "get_start_page_token",
            duration_ms=duration_ms,
            token_prefix=token[:10] if token else None
        )
        return token
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        perf_logger.error(
            "get_start_page_token",
            duration_ms=duration_ms,
            message=f"Error: {str(e)}"
        )
        raise


def list_changes(
    service,
    page_token: str,
    progress_callback: Optional[Callable[[int, int], None]] = None
) -> Tuple[List[Dict[str, Any]], str]:
    """
    Fetch changes since the given page token.
    
    This is the core of incremental sync - it returns only files that
    have been added, modified, or removed since the token was issued.
    
    Args:
        service: Authenticated Google Drive API service
        page_token: The page token from previous sync or getStartPageToken
        progress_callback: Optional callback(changes_fetched, page_count) for progress
        
    Returns:
        Tuple of (list of change dicts, new_start_page_token)
        
    Each change dict has:
        - fileId: The ID of the changed file
        - removed: True if file was deleted/removed from view
        - file: File object (if not removed) with full metadata
    """
    all_changes = []
    current_token = page_token
    page_count = 0
    new_start_token = None
    start_time = time.perf_counter()
    
    while True:
        try:
            page_count += 1
            page_start = time.perf_counter()
            
            response = service.changes().list(
                pageToken=current_token,
                spaces="drive",
                includeItemsFromAllDrives=False,
                supportsAllDrives=False,
                fields=CHANGES_FIELDS,
                pageSize=1000
            ).execute()
            
            page_duration_ms = (time.perf_counter() - page_start) * 1000
            
            changes = response.get('changes', [])
            all_changes.extend(changes)
            
            # Call progress callback if provided
            if progress_callback:
                progress_callback(len(all_changes), page_count)
            
            # Log progress
            if page_count % 5 == 0 or page_duration_ms > 1000:
                perf_logger.info(
                    "list_changes.page_fetch",
                    duration_ms=page_duration_ms,
                    page=page_count,
                    changes_so_far=len(all_changes)
                )
            
            # Check for more pages
            next_page_token = response.get('nextPageToken')
            if next_page_token:
                current_token = next_page_token
            else:
                # No more pages - get the new start token for next sync
                new_start_token = response.get('newStartPageToken')
                break
                
        except Exception as e:
            total_duration_ms = (time.perf_counter() - start_time) * 1000
            perf_logger.error(
                "list_changes",
                duration_ms=total_duration_ms,
                message=f"Error fetching changes page {page_count}: {str(e)}",
                pages_fetched=page_count,
                changes_fetched=len(all_changes)
            )
            import traceback
            traceback.print_exc()
            raise
    
    total_duration_ms = (time.perf_counter() - start_time) * 1000
    perf_logger.info(
        "list_changes",
        duration_ms=total_duration_ms,
        changes=len(all_changes),
        pages=page_count
    )
    
    return all_changes, new_start_token





