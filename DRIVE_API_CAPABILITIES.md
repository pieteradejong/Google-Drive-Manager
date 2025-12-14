# Google Drive API Capabilities & Ideas

This document outlines interesting Google Drive API features that could enhance the Google Drive Manager project.

## 🔍 File Discovery & Search

### 1. **Find Duplicates via Shortcuts**
Google Drive shortcuts (introduced in 2020) are special file types (`mimeType='application/vnd.google-apps.shortcut'`) that reference other files. You could:
- Detect duplicate files by finding shortcuts pointing to the same target
- Identify files referenced multiple times
- Use `targetId` field to track the original file

```python
# Find all shortcuts
service.files().list(
    q="mimeType='application/vnd.google-apps.shortcut'",
    fields="files(id, name, shortcutDetails)"
).execute()
```

### 2. **Files with Multiple Parents**
Files can exist in multiple locations via the `parents` array. Currently you handle this, but you could:
- Visualize files that appear in multiple folders
- Calculate "virtual size" (size counted multiple times vs actual storage)
- Identify shared organizational structures

### 3. **Advanced Query Examples**
```python
# Files shared with you (not owned by you)
q="sharedWithMe=true and owners != me"

# Files you've starred
q="starred=true"

# Files modified in last 7 days
q="modifiedTime > '2024-01-01T00:00:00'"

# Large video files
q="mimeType contains 'video' and size > '1073741824'"  # > 1GB

# Files you can edit vs view-only
q="capabilities.canEdit=true"

# Files with thumbnails (good for gallery views)
q="hasThumbnail=true"

# Google Workspace files (Docs, Sheets, Slides)
q="mimeType='application/vnd.google-apps.document'"

# Files in specific folder
q="'FOLDER_ID' in parents"
```

### 4. **Search by Custom Properties**
Files can have custom metadata properties:
```python
# Set custom properties
service.files().update(
    fileId=file_id,
    body={'properties': {'project': 'website', 'status': 'active'}}
).execute()

# Query by properties
q="properties has {key='project' and value='website'}"
```

---

## 👥 Sharing & Permissions

### 5. **Permissions Analysis**
Get detailed sharing information:
```python
# Get all permissions for a file
permissions = service.permissions().list(fileId=file_id).execute()

# Each permission includes:
# - role: owner, writer, reader, commenter
# - type: user, group, domain, anyone
# - emailAddress: for users
# - expirationTime: for time-limited access
# - allowFileDiscovery: if file is discoverable
```

**Use cases:**
- Find files shared publicly (`anyoneWithLink`)
- Identify files shared externally (outside your domain)
- List files shared with specific users
- Find files with expired permissions
- Detect over-permissive files (shared with everyone)

### 6. **Shared Drives Support**
If your organization uses Shared Drives (formerly Team Drives):
```python
# List all shared drives
service.drives().list().execute()

# Access files in shared drives
service.files().list(
    supportsAllDrives=True,
    includeItemsFromAllDrives=True,
    q="'SHARED_DRIVE_ID' in parents"
).execute()
```

---

## 📊 Activity & History

### 7. **Drive Activity API** (Separate API)
Get detailed activity logs:
- Who created/modified/deleted files
- Permission changes
- Comments and replies
- File moves and renames

**Use cases:**
- Activity timeline visualization (you already have `ActivityTimelineView`!)
- Audit log analysis
- Detect suspicious activity
- Track collaboration patterns
- Identify most active folders/users

### 8. **Revisions API**
Access version history for files:
```python
# List all revisions
revisions = service.revisions().list(fileId=file_id).execute()

# Get specific revision
revision = service.revisions().get(
    fileId=file_id,
    revisionId=revision_id
).execute()
```

**Note:** Revisions only work for binary files (images, PDFs, etc.). For Google Workspace files (Docs/Sheets), use Drive Activity API instead.

**Use cases:**
- Show version history in file details
- Calculate version storage overhead
- Identify files with many versions (storage optimization opportunity)

---

## 💬 Collaboration Features

### 9. **Comments API**
Read and manage comments on files:
```python
# List comments on a file
comments = service.comments().list(fileId=file_id).execute()

# Create a comment
service.comments().create(
    fileId=file_id,
    body={'content': 'Great work!'}
).execute()
```

**Use cases:**
- Show comment count per file
- Identify files with active discussions
- Find unresolved comments
- Collaboration metrics

### 10. **Replies API**
Manage replies to comments:
```python
# List replies to a comment
replies = service.replies().list(
    fileId=file_id,
    commentId=comment_id
).execute()
```

---

## 🎨 Rich Metadata

### 11. **File Capabilities**
Understand what actions are possible:
```python
file = service.files().get(
    fileId=file_id,
    fields="capabilities"
).execute()

# capabilities includes:
# - canEdit, canComment, canShare, canCopy
# - canDelete, canDownload, canListChildren
# - canTrash, canUntrash, canReadRevisions
```

**Use cases:**
- Show editable vs read-only files differently
- Filter by permission level
- Identify locked files

### 12. **Thumbnails**
Get preview images for files:
```python
file = service.files().get(
    fileId=file_id,
    fields="thumbnailLink,thumbnailVersion"
).execute()

# Use thumbnailLink for image previews
```

**Use cases:**
- Gallery view with thumbnails
- Image preview in file lists
- Visual file browser

### 13. **Folder Colors**
Folders can have custom colors:
```python
# Get folder color
folder = service.files().get(
    fileId=folder_id,
    fields="folderColorRgb"
).execute()

# Set folder color
service.files().update(
    fileId=folder_id,
    body={'folderColorRgb': '#FF6B6B'}
).execute()
```

**Use cases:**
- Visual organization in folder views
- Color-code by category or priority

### 14. **Stars**
Files can be starred:
```python
# Get starred status
file = service.files().get(
    fileId=file_id,
    fields="starred"
).execute()

# Update starred status
service.files().update(
    fileId=file_id,
    body={'starred': True}
).execute()
```

**Use cases:**
- Favorites/starred files view
- Quick access to important files

---

## 📥 Export & Download

### 15. **Export Google Workspace Files**
Convert Docs/Sheets/Slides to other formats:
```python
# Export Google Doc to PDF
request = service.files().export_media(
    fileId=file_id,
    mimeType='application/pdf'
)

# Export Google Sheet to Excel
request = service.files().export_media(
    fileId=file_id,
    mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
)
```

**Use cases:**
- Bulk export workspace files
- Generate PDF backups
- Convert formats for offline use

### 16. **Download Files**
Download file content:
```python
# Download file
request = service.files().get_media(fileId=file_id)
fh = io.BytesIO()
downloader = MediaIoBaseDownload(fh, request)
done = False
while done is False:
    status, done = downloader.next_chunk()
```

---

## 🏗️ File Operations

### 17. **Batch Operations**
Perform multiple operations efficiently:
```python
batch = service.new_batch_http_request()

# Add multiple requests
batch.add(service.files().get(fileId='id1'))
batch.add(service.files().get(fileId='id2'))
batch.add(service.files().get(fileId='id3'))

# Execute all at once (up to 100 requests)
batch.execute()
```

**Use cases:**
- Faster bulk operations
- Reduce API quota usage
- Better performance for large scans

### 18. **Create/Update/Delete Files**
Programmatically manage files:
```python
# Create a folder
service.files().create(
    body={
        'name': 'New Folder',
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': ['parent_folder_id']
    }
).execute()

# Move file (change parents)
service.files().update(
    fileId=file_id,
    addParents='new_parent_id',
    removeParents='old_parent_id'
).execute()

# Trash file
service.files().update(
    fileId=file_id,
    body={'trashed': True}
).execute()
```

**Use cases:**
- Automated file organization
- Bulk cleanup operations
- Folder restructuring

---

## 📈 Analytics & Insights

### 19. **Storage Quota Breakdown**
Get detailed storage info:
```python
about = service.about().get(
    fields="storageQuota,user,maxUploadSize"
).execute()

# storageQuota includes:
# - limit: total quota
# - usage: total used (including Gmail, Photos)
# - usageInDrive: storage used in Drive only
# - usageInDriveTrash: storage in trash
```

**Use cases:**
- Show trash size (recoverable space)
- Breakdown by service (Drive vs Gmail vs Photos)
- Storage optimization recommendations

### 20. **MIME Type Analysis**
Analyze file types for insights:
```python
# Group by MIME type
mime_types = {}
for file in all_files:
    mime = file.get('mimeType', 'unknown')
    mime_types[mime] = mime_types.get(mime, 0) + 1
```

**Use cases:**
- Storage breakdown by file type
- Identify uncommon file types
- Find optimization opportunities (e.g., large uncompressed images)

---

## 🔔 Real-time Updates

### 21. **Push Notifications**
Subscribe to file changes via webhooks:
```python
# Create a channel/watch for file changes
service.files().watch(
    fileId=file_id,
    body={
        'id': channel_id,
        'type': 'web_hook',
        'address': 'https://your-app.com/notifications'
    }
).execute()
```

**Use cases:**
- Real-time cache invalidation
- Live updates in UI
- Event-driven workflows

---

## 🎯 Ideas for Your Project

### High-Value Features to Add

1. **Permissions Analyzer View**
   - Show files shared publicly
   - List externally shared files
   - Find over-permissive files
   - Permission audit report

2. **Duplicate File Finder Enhancement**
   - Use shortcuts API to find duplicates
   - Compare file hashes (would need download)
   - Find files with same name/size/date

3. **Activity Timeline Enhancement**
   - Integrate Drive Activity API
   - Show who changed what
   - Filter by user/action type
   - Collaboration metrics

4. **Thumbnail Gallery View**
   - Visual file browser with thumbnails
   - Image-heavy folder views
   - Quick visual search

5. **Export Manager**
   - Bulk export Google Workspace files
   - Convert formats
   - Download backups

6. **Storage Optimizer**
   - Find large files with many versions
   - Identify empty or nearly-empty folders
   - Trash analysis (recoverable space)
   - Duplicate detection

7. **Smart Search**
   - Search by custom properties
   - Filter by capabilities (editable, shareable)
   - Find files by owner
   - Date range searches

8. **Collaboration Dashboard**
   - Files with most comments
   - Recently shared files
   - Shared files by user
   - Active collaboration metrics

---

## 📚 Resources

- [Google Drive API v3 Reference](https://developers.google.com/drive/api/reference/rest/v3)
- [Drive Activity API](https://developers.google.com/drive/activity/v2)
- [Permissions Guide](https://developers.google.com/drive/api/guides/manage-sharing)
- [Query Parameters](https://developers.google.com/drive/api/guides/search-files)
- [Batch Requests](https://developers.google.com/drive/api/guides/batch)

---

## 🔐 Scopes Needed

To use these features, you may need additional OAuth scopes:

```python
SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',  # Current
    'https://www.googleapis.com/auth/drive.metadata.readonly',  # Metadata only
    'https://www.googleapis.com/auth/drive.activity.readonly',  # Activity API
    'https://www.googleapis.com/auth/drive.comments.readonly',  # Comments
    # For write operations:
    'https://www.googleapis.com/auth/drive.file',  # Files you create
    'https://www.googleapis.com/auth/drive',  # Full access (use carefully)
]
```
