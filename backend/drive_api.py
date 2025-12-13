"""Core Google Drive API operations."""
from collections import defaultdict
from typing import Dict, List, Any, Optional
from datetime import datetime


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
    
    while True:
        try:
            page_count += 1
            if page_count % 10 == 0:
                print(f"  Fetched {len(all_files)} files so far...")
            
            results = service.files().list(
                q="trashed=false",
                pageSize=1000,
                fields="nextPageToken, files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink)",
                pageToken=page_token
            ).execute()
            
            files = results.get('files', [])
            all_files.extend(files)
            page_token = results.get('nextPageToken')
            
            if not page_token:
                break
                
        except Exception as e:
            print(f"Error fetching files: {e}")
            import traceback
            traceback.print_exc()
            break
    
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
    for folder in folders:
        if 'calculatedSize' not in folder:
            calc_size(folder['id'])
    
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
    folders = []
    page_token = None
    estimated_total = None
    
    # First, get a sample to estimate total files
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
            print(f"Error fetching top-level folders: {e}")
            break
    
    # For quick scan, we skip size calculation to keep it fast
    # Sizes will be calculated during full scan
    # Set calculatedSize to 0 for now
    for folder in folders:
        folder['calculatedSize'] = 0
    
    return folders, estimated_total


def check_recently_modified(service, since_timestamp: datetime, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Check for files modified since a given timestamp.
    
    This is used for cache invalidation - if any files have been modified
    since the cache was created, the cache should be invalidated.
    
    Args:
        service: Authenticated Google Drive API service
        since_timestamp: Datetime to check for modifications after
        limit: Maximum number of recent files to return
        
    Returns:
        List of recently modified file dictionaries (empty if none found)
    """
    try:
        # Format timestamp for Drive API query (RFC 3339 format)
        # Drive API expects format: YYYY-MM-DDTHH:MM:SS
        timestamp_str = since_timestamp.strftime('%Y-%m-%dT%H:%M:%S')
        
        # Query for files modified after the timestamp, ordered by modification time
        results = service.files().list(
            q=f"trashed=false and modifiedTime > '{timestamp_str}'",
            orderBy="modifiedTime desc",
            pageSize=limit,
            fields="files(id, name, modifiedTime)"
        ).execute()
        
        return results.get('files', [])
    except Exception as e:
        print(f"Error checking recently modified files: {e}")
        # Return empty list on error - we'll fall back to time-based validation
        return []





