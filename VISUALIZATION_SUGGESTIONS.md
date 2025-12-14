# Google Drive Visualization Suggestions

## Available Data

Based on the codebase, we have access to:

### File/Folder Metadata
- **id**: Unique file identifier
- **name**: File/folder name
- **mimeType**: File type (e.g., `text/plain`, `application/vnd.google-apps.folder`)
- **size**: File size in bytes (for files only)
- **calculatedSize**: Recursively calculated folder size (for folders)
- **createdTime**: When file was created (ISO timestamp)
- **modifiedTime**: When file was last modified (ISO timestamp)
- **webViewLink**: URL to open file in Google Drive
- **parents**: Array of parent folder IDs (can have multiple parents for shared files)

### Relationships
- **children_map**: Parent folder ID → Array of child file/folder IDs
- **Hierarchy**: Full folder tree structure

### Storage Info
- **total_quota**: Total storage quota
- **used**: Storage used
- **user_email**: Account email
- **user_display_name**: Account name

## Current Visualizations (9 core + analysis views)

### Navigation Views
1. ✅ **Folder First** - Folder-by-folder navigation (Finder/Explorer style)
2. ✅ **Sidebar Tree** - Expandable folder tree sidebar
3. ✅ **Breadcrumb** - Breadcrumb drill-down navigation
4. ✅ **Card View** - Card-based folder display
5. ✅ **List** - Hierarchical list view

### Visualization Views
6. ✅ **Size Grid** - Size-based grid with visual scaling
7. ✅ **Timeline** - Chronological organization by modified date
8. ✅ **Type Grouped** - Files grouped by mimeType
9. ✅ **Search First** - Search-focused interface

### Analysis & Insights (See FAVORITE_VISUALIZATIONS.md)
- **Folder Depth** - Analyze folder structure depth and complexity
- **Duplicate Finder** - Find duplicate files with full paths and metadata verification
- **Orphaned Files** - Detect files with broken parent folder references
- **Storage Dashboard** - Overview of storage usage
- **Large Files** - Find large files taking up space
- **File Age Analysis** - Analyze files by age
- **Activity Timeline** - Timeline of file activity
- **Shared Files** - Analyze shared files and permissions

## Suggested New Visualizations

### High Value - Storage Management

#### 1. **Storage Breakdown Dashboard**
**Purpose**: Quick overview of storage usage
- Pie chart: Storage by file type (Images, Videos, Documents, etc.)
- Bar chart: Top 10 largest folders
- Progress bar: Storage quota usage
- Recent activity: Files modified in last 7/30 days
- **Data needed**: All available ✅

#### 2. **Duplicate File Finder**
**Purpose**: Find duplicate files to free up space
- Group files by name + size (potential duplicates)
- Show file locations (which folders contain duplicates)
- Calculate potential space savings
- **Data needed**: name, size, parents ✅
- **Enhancement**: Could add hash comparison if we fetch file content

#### 3. **Large Files/Folders Finder**
**Purpose**: Identify space hogs
- Sortable table: All files/folders sorted by size
- Filter by minimum size (e.g., > 100MB)
- Show file type distribution of large files
- **Data needed**: size, calculatedSize, mimeType ✅

#### 4. **Storage by File Type (Enhanced)**
**Purpose**: Understand what's using space
- Pie/Donut chart: Storage percentage by type
- Bar chart: Count vs Size by type
- Interactive: Click type to see files
- **Data needed**: mimeType, size, calculatedSize ✅

### Medium Value - Organization & Analysis

#### 5. **Folder Depth Analysis**
**Purpose**: Understand folder structure complexity
- Heatmap: Folder depth distribution
- Tree diagram: Show deepest paths
- Statistics: Average depth, max depth
- **Data needed**: parents, children_map ✅

#### 6. **File Age Analysis**
**Purpose**: Find old/unused files
- Histogram: Files by age (0-30 days, 30-90, 90-180, 180-365, 365+)
- Oldest files list: Files not modified in X days
- Recently created: New files in last 30 days
- **Data needed**: createdTime, modifiedTime ✅

#### 7. **Activity Timeline (Enhanced)**
**Purpose**: See when files were created/modified
- Calendar heatmap: Activity by day
- Line chart: Files created/modified over time
- Peak activity periods: When you're most active
- **Data needed**: createdTime, modifiedTime ✅

#### 8. **Shared Files Analysis**
**Purpose**: Understand file sharing
- List: Files with multiple parents (shared)
- Count: How many files are shared
- **Data needed**: parents array ✅

#### 9. **Orphaned Files Detector**
**Purpose**: Find files with broken parent references
- List: Files whose parents don't exist
- **Data needed**: parents, children_map ✅

### Lower Priority - Advanced Features

#### 10. **Storage Growth Projection**
**Purpose**: Predict future storage needs
- Line chart: Storage over time (if we track history)
- Projection: Extrapolate growth rate
- **Data needed**: Historical data (not currently available)
- **Enhancement**: Would need to track scans over time

#### 11. **File Type Efficiency**
**Purpose**: Compare compressed vs uncompressed formats
- Comparison: PDF vs DOCX sizes
- Image formats: JPG vs PNG vs HEIC
- **Data needed**: mimeType, size ✅

#### 12. **Folder Health Score**
**Purpose**: Identify problematic folders
- Score based on: depth, file count, size, age
- Flag: Deep hierarchies, many small files, very old files
- **Data needed**: All available ✅

## Recommended Priority Order

### Phase 1: Storage Management (Most Useful)
1. **Storage Breakdown Dashboard** - Quick overview
2. **Large Files/Folders Finder** - Find space hogs
3. **Storage by File Type (Enhanced)** - Understand usage

### Phase 2: Organization
4. **Duplicate File Finder** - Free up space
5. **File Age Analysis** - Find old files
6. **Activity Timeline** - See patterns

### Phase 3: Advanced
7. **Folder Depth Analysis** - Understand structure
8. **Shared Files Analysis** - Understand sharing
9. **Orphaned Files Detector** - Fix issues

## Implementation Notes

### Easy to Implement (Using Existing Data)
- ✅ Storage Breakdown Dashboard
- ✅ Large Files/Folders Finder
- ✅ Storage by File Type (Enhanced)
- ✅ File Age Analysis
- ✅ Activity Timeline
- ✅ Shared Files Analysis
- ✅ Orphaned Files Detector
- ✅ Folder Depth Analysis

### Requires Additional Data
- ⚠️ Duplicate File Finder (needs file hashes for accurate detection)
- ⚠️ Storage Growth Projection (needs historical scan data)

### Data We Could Fetch (But Don't Currently)
- File hashes (for duplicate detection)
- File permissions/sharing settings
- File versions
- File descriptions/metadata
- Owner information
- Last accessed time (if available)

## Quick Wins

Based on available data, these would be easiest and most useful:

1. **Storage Breakdown Dashboard** - Single page with multiple charts
2. **Large Files Table** - Sortable, filterable table of largest items
3. **File Age Histogram** - Visual breakdown of file ages
4. **Enhanced Type View** - Add pie chart to existing Type Grouped view

All of these can use existing data and would provide immediate value for storage management.
