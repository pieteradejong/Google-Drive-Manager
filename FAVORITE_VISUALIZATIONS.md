# Favorite Visualizations Documentation

This document describes the three core visualizations that provide the most value for Google Drive management and analysis.

## 1. Folder Depth Analysis

### Purpose
Analyzes the depth and complexity of your folder structure to identify:
- How deeply nested your folders are
- Distribution of folders across different depth levels
- The deepest folder paths in your Drive
- Average folder depth across the entire structure

### What It Shows

#### Key Metrics
- **Max Depth**: The deepest folder level in your Drive (e.g., "8 levels")
- **Average Depth**: Mean depth across all folders (e.g., "3.2 levels")
- **Total Folders**: Count of all folders in your Drive

#### Visualizations

1. **Depth Distribution Chart**
   - Bar chart showing folder count and total size at each depth level
   - Helps identify where most of your folders (and storage) are located
   - X-axis: Depth levels (Level 0, Level 1, Level 2, etc.)
   - Y-axis (left): Number of folders
   - Y-axis (right): Total size at that depth

2. **Deepest Folder Paths**
   - List of the 10 deepest folder paths in your Drive
   - Shows the full path from root to the deepest folder
   - Displays folder size for each path
   - Click any folder to open it in Google Drive

3. **Depth Statistics Table**
   - Complete breakdown by depth level
   - Shows folder count and total size for each level
   - Sorted from shallowest (Level 0) to deepest

### Use Cases

- **Structure Optimization**: Identify if you have overly deep folder structures that make navigation difficult
- **Organization Planning**: Understand where to focus reorganization efforts
- **Performance**: Very deep structures can slow down file access and navigation
- **Storage Analysis**: See where large amounts of data are stored by depth level

### Technical Details

- Calculates depth recursively by traversing parent-child relationships
- Handles multiple parents (shared folders) by using the first parent
- Prevents infinite loops from circular references
- Depth is calculated from root (Level 0) where root folders have depth 0

---

## 2. Duplicate File Finder

### Purpose
Identifies files that have the same name and size, helping you:
- Find true duplicate files (identical content)
- Free up storage space by removing duplicates
- Verify duplicates are actually identical using metadata comparison
- Make informed decisions about which duplicates to keep

### What It Shows

#### Detection Method
Files are considered duplicates if they have:
- **Same filename** (exact match)
- **Same file size** (bytes)
- **Same file type** (MIME type) - displayed but not required for grouping

#### Verification System
Each duplicate group shows whether files are truly identical:

- **✅ Verified Identical**: All files in the group have:
  - Same name
  - Same size
  - Same MIME type
  - Same created date
  - Same modified date
  - These are highly likely to be true duplicates

- **⚠️ Check Metadata**: Files have same name and size but:
  - Different created/modified dates, OR
  - Different metadata
  - These may be different versions of similar files - verify manually

#### Display Information

For each duplicate group:
- **File name** and **number of copies**
- **File size** (each copy)
- **File type** (MIME type)
- **Potential savings** if duplicates are removed
- **Verification status** (identical or needs checking)

For each file in a group:
- **Full folder path** - Complete path from root (e.g., `/Documents/Projects/2024/Reports`)
- **Created date** - When the file was created
- **Modified date** - Last modification timestamp
- **File type** - MIME type breakdown
- **Action buttons**:
  - "Keep this one" (first file in group)
  - "Can delete" (all other files)
  - "Open →" (link to view in Google Drive)

#### Filters

- **Min duplicates**: Minimum number of copies to show (default: 2)
  - Set higher to focus on files with many duplicates
- **Min file size (MB)**: Only show duplicates above a certain size
  - Helps focus on files that matter for storage recovery
  - Example: Set to 10 MB to find large duplicates only

#### Total Potential Savings
Header shows total storage space that could be recovered by removing all detected duplicates (keeping one copy of each).

### Use Cases

- **Storage Cleanup**: Find and remove duplicate files to free space
- **File Organization**: Identify files that were accidentally copied
- **Backup Management**: Find duplicate backups that can be consolidated
- **Version Control**: Identify old versions that can be removed

### Technical Details

- Groups files by `name|size` key (exact matches required)
- Metadata verification compares: name, size, mimeType, createdTime, modifiedTime
- Full paths built using parent folder relationships
- Shows first parent path for files with multiple parents
- Potential savings calculated as: `(fileCount - 1) * fileSize`

### Important Notes

⚠️ **Not a content hash comparison**: This tool compares filenames and sizes, not actual file contents. Two files with the same name and size could theoretically have different content, though this is rare.

✅ **Metadata verification helps**: The "Verified Identical" badge indicates files are very likely true duplicates when all metadata matches.

📝 **Manual verification recommended**: Before deleting, especially for files marked "Check metadata", verify they are actually duplicates by opening and comparing them.

---

## 3. Orphaned Files Detector

### Purpose
Identifies files and folders that have **broken parent folder references** - files whose parent folders no longer exist in your Drive. This helps:
- Find files that appear "lost" or inaccessible through normal folder navigation
- Identify data integrity issues in your Drive structure
- Discover files that may have become inaccessible due to folder deletion or sharing changes
- Ensure your folder tree structure is complete and valid

### What Are Orphaned Files?

An orphaned file is one whose parent folder ID (stored in the `parents` array) doesn't exist in your Drive's file list. This can happen when:

1. **Parent folder was deleted** - But the file itself wasn't deleted (rare, but possible)
2. **Access permission changed** - You lost access to a parent folder in a shared structure
3. **API sync issues** - Temporary inconsistencies in Drive API data
4. **Multiple parent relationships** - Files with multiple parents where one parent is missing

**Note**: Files in the root folder (with no parents) are **not** considered orphaned - they're legitimate root-level files.

### What It Shows

#### Summary Statistics
- **Total Orphaned**: Count of all orphaned files and folders
- **Orphaned Folders**: Count of orphaned folders specifically
- **Orphaned Files**: Count of orphaned regular files (not folders)

#### File Lists

1. **Orphaned Folders Section**
   - Lists all folders with broken parent references
   - Shows folder name
   - Displays the missing parent ID(s)
   - Shows folder size (calculated)
   - Click to open in Google Drive (if accessible)

2. **Orphaned Files Section**
   - Lists all files (non-folders) with broken parent references
   - Shows file name
   - Displays the missing parent ID(s)
   - Shows file size
   - Click to open in Google Drive (if accessible)

#### Display Details

For each orphaned item:
- **File/Folder name**
- **Missing parent IDs** - The IDs of parent folders that don't exist
- **Size** - File size or calculated folder size
- **Visual indicator** - Amber/orange background to highlight the issue
- **Unlink icon** - Visual indicator showing broken relationship

### Use Cases

- **Data Integrity Check**: Ensure your Drive structure is healthy
- **Access Troubleshooting**: Find files that might be inaccessible
- **Cleanup**: Identify files that might need to be moved or deleted
- **Audit**: Regular checks for structural issues in large Drives

### Technical Details

- Checks all files to see if their `parents` array contains IDs that exist in the file list
- Uses a Set of valid file IDs for O(1) lookup performance
- Handles files with multiple parents (orphaned if ANY parent is missing)
- Root files (no parents) are explicitly excluded from orphaned detection
- Missing parent IDs are shown to help with debugging

### Important Notes

🔍 **Not necessarily lost**: Orphaned files might still be accessible through:
- Direct file links
- Search
- Google Drive interface (which may have better recovery mechanisms)

⚠️ **Investigate before deleting**: Orphaned files might still contain important data. Check if they're accessible through other means before removing them.

🔗 **Multiple parents**: Google Drive allows files to have multiple parents (shared locations). A file is only orphaned if ALL its parents are missing.

✅ **Healthy Drives**: Most well-maintained Drives will show 0 orphaned files. Finding orphaned files suggests:
- A folder was deleted but files weren't properly cleaned up
- Sharing/permission changes occurred
- API sync issues (rare)

---

## Summary

These three visualizations work together to provide comprehensive Drive analysis:

1. **Folder Depth** → Understand your structure's complexity
2. **Duplicate Finder** → Recover storage space
3. **Orphaned Files** → Ensure data integrity

All three use the full Drive scan data to provide accurate, actionable insights for managing your Google Drive storage effectively.
