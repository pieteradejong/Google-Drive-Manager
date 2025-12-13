/** Navigation utilities for Drive file/folder navigation */
import type { FileItem } from '../types/drive';

/**
 * Format bytes to human-readable size string
 */
export function formatSize(bytes: number | undefined): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Get files and folders in a specific folder
 */
export function getCurrentFolderContents(
  folderId: string | null,
  files: FileItem[],
  childrenMap: Record<string, string[]>
): FileItem[] {
  if (folderId === null) {
    // Root folder: files with no parents
    return files.filter((f) => f.parents.length === 0);
  }
  
  // Get children of this folder
  const childIds = childrenMap[folderId] || [];
  return files.filter((f) => childIds.includes(f.id));
}

/**
 * Build breadcrumb path from root to a folder
 */
export function getFolderPath(
  folderId: string | null,
  files: FileItem[]
): FileItem[] {
  if (folderId === null) {
    return [];
  }
  
  const path: FileItem[] = [];
  let currentId: string | null = folderId;
  
  while (currentId !== null) {
    const folder = files.find((f) => f.id === currentId);
    if (!folder) break;
    
    path.unshift(folder);
    // Get parent (first parent if multiple)
    currentId = folder.parents.length > 0 ? folder.parents[0] : null;
  }
  
  return path;
}

/**
 * Get parent folder ID for a given folder
 */
export function getParentFolder(
  folderId: string | null,
  files: FileItem[]
): string | null {
  if (folderId === null) {
    return null; // Root has no parent
  }
  
  const folder = files.find((f) => f.id === folderId);
  if (!folder || folder.parents.length === 0) {
    return null;
  }
  
  return folder.parents[0];
}

/**
 * Build folder tree structure for sidebar navigation
 */
export interface FolderTreeNode {
  id: string;
  name: string;
  children: FolderTreeNode[];
  file: FileItem;
}

export function buildFolderTree(
  files: FileItem[],
  childrenMap: Record<string, string[]>
): FolderTreeNode[] {
  const folders = files.filter(
    (f) => f.mimeType === 'application/vnd.google-apps.folder'
  );
  
  const MAX_DEPTH = 20; // Reasonable limit for folder depth
  const visited = new Set<string>(); // Track visited to prevent cycles
  
  const buildNode = (folderId: string, depth: number = 0, path: Set<string> = new Set()): FolderTreeNode | null => {
    // Prevent infinite loops from circular references
    if (path.has(folderId)) {
      console.warn(`Circular reference detected in folder tree for ${folderId}`);
      return null;
    }
    
    // Limit recursion depth
    if (depth > MAX_DEPTH) {
      return null;
    }
    
    const folder = files.find((f) => f.id === folderId);
    if (!folder) return null;
    
    const newPath = new Set(path);
    newPath.add(folderId);
    
    const childIds = childrenMap[folderId] || [];
    const childFolders = childIds
      .map((id) => files.find((f) => f.id === id))
      .filter((f): f is FileItem => f !== undefined && f.mimeType === 'application/vnd.google-apps.folder');
    
    return {
      id: folder.id,
      name: folder.name,
      file: folder,
      children: childFolders
        .map((f) => buildNode(f.id, depth + 1, newPath))
        .filter((n): n is FolderTreeNode => n !== null),
    };
  };
  
  // Start with root folders
  const rootFolders = folders.filter((f) => f.parents.length === 0);
  return rootFolders
    .slice(0, 100) // Limit to first 100 root folders to prevent overload
    .map((f) => buildNode(f.id))
    .filter((n): n is FolderTreeNode => n !== null);
}

/**
 * Filter files by mimeType category
 */
export function filterByType(
  files: FileItem[],
  category: 'image' | 'document' | 'video' | 'audio' | 'folder' | 'other'
): FileItem[] {
  const categoryPatterns: Record<string, string[]> = {
    image: ['image/'],
    document: ['application/pdf', 'application/vnd.google-apps.document', 'application/msword', 'application/vnd.openxmlformats-officedocument'],
    video: ['video/'],
    audio: ['audio/'],
    folder: ['application/vnd.google-apps.folder'],
  };
  
  if (category === 'other') {
    const allPatterns = Object.values(categoryPatterns).flat();
    return files.filter(
      (f) => !allPatterns.some((pattern) => f.mimeType.startsWith(pattern))
    );
  }
  
  const patterns = categoryPatterns[category] || [];
  return files.filter((f) =>
    patterns.some((pattern) => f.mimeType.startsWith(pattern))
  );
}

/**
 * Sort files by size (largest first)
 */
export function sortBySize(files: FileItem[]): FileItem[] {
  return [...files].sort((a, b) => {
    const sizeA = a.calculatedSize || a.size || 0;
    const sizeB = b.calculatedSize || b.size || 0;
    return sizeB - sizeA;
  });
}

/**
 * Sort files by modified date (newest first)
 */
export function sortByDate(files: FileItem[]): FileItem[] {
  return [...files].sort((a, b) => {
    const dateA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
    const dateB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
    return dateB - dateA;
  });
}

/**
 * Sort files by name (alphabetical)
 */
export function sortByName(files: FileItem[]): FileItem[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Group files by date period (day/week/month)
 */
export function groupByDatePeriod(
  files: FileItem[],
  period: 'day' | 'week' | 'month' = 'day'
): Record<string, FileItem[]> {
  const groups: Record<string, FileItem[]> = {};
  
  files.forEach((file) => {
    if (!file.modifiedTime) {
      const key = 'No date';
      if (!groups[key]) groups[key] = [];
      groups[key].push(file);
      return;
    }
    
    const date = new Date(file.modifiedTime);
    let key: string;
    
    if (period === 'day') {
      key = date.toISOString().split('T')[0]; // YYYY-MM-DD
    } else if (period === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      // month
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    if (!groups[key]) groups[key] = [];
    groups[key].push(file);
  });
  
  return groups;
}

/**
 * Group files by mimeType category
 */
export function groupByType(files: FileItem[]): Record<string, FileItem[]> {
  const groups: Record<string, FileItem[]> = {
    Folders: [],
    Images: [],
    Documents: [],
    Videos: [],
    Audio: [],
    Other: [],
  };
  
  files.forEach((file) => {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      groups.Folders.push(file);
    } else if (file.mimeType.startsWith('image/')) {
      groups.Images.push(file);
    } else if (
      file.mimeType.startsWith('application/pdf') ||
      file.mimeType.startsWith('application/vnd.google-apps.document') ||
      file.mimeType.startsWith('application/msword') ||
      file.mimeType.startsWith('application/vnd.openxmlformats')
    ) {
      groups.Documents.push(file);
    } else if (file.mimeType.startsWith('video/')) {
      groups.Videos.push(file);
    } else if (file.mimeType.startsWith('audio/')) {
      groups.Audio.push(file);
    } else {
      groups.Other.push(file);
    }
  });
  
  // Remove empty categories
  Object.keys(groups).forEach((key) => {
    if (groups[key].length === 0) {
      delete groups[key];
    }
  });
  
  return groups;
}

/**
 * Search files by name
 */
export function searchFiles(
  files: FileItem[],
  query: string
): FileItem[] {
  if (!query.trim()) return files;
  
  const lowerQuery = query.toLowerCase();
  return files.filter((file) =>
    file.name.toLowerCase().includes(lowerQuery)
  );
}
