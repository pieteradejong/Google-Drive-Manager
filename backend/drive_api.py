"""Core Google Drive API operations."""
from collections import defaultdict
from typing import Dict, List, Any, Optional


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
    
    while True:
        try:
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

