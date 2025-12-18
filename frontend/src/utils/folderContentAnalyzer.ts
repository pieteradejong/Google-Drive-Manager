/** Utilities to analyze folder contents and provide meaningful summaries */
import type { FileItem } from '../types/drive';

export interface FolderContentSummary {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  fileTypes: Record<string, number>; // MIME type -> count
  fileTypeGroups: {
    images: number;
    videos: number;
    documents: number;
    code: number;
    archives: number;
    other: number;
  };
  topFileTypes: Array<{ type: string; count: number; size: number }>;
  purpose: string; // Human-readable description
  likelyProject: boolean; // true if looks like a code project
  likelyBackup: boolean; // true if looks like a backup
  likelyMedia: boolean; // true if mostly images/videos
}

/**
 * Analyze folder contents to provide meaningful summary
 */
export function analyzeFolderContents(
  folder: FileItem,
  children: FileItem[],
  _allFiles: FileItem[] // Reserved for future recursive analysis
): FolderContentSummary {
  const files = children.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  const subfolders = children.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  
  // Count file types
  const fileTypes: Record<string, number> = {};
  const typeSizes: Record<string, number> = {};
  
  files.forEach(file => {
    const mimeType = file.mimeType || 'unknown';
    fileTypes[mimeType] = (fileTypes[mimeType] || 0) + 1;
    typeSizes[mimeType] = (typeSizes[mimeType] || 0) + (file.size || 0);
  });
  
  // Group file types
  const fileTypeGroups = {
    images: 0,
    videos: 0,
    documents: 0,
    code: 0,
    archives: 0,
    other: 0,
  };
  
  Object.entries(fileTypes).forEach(([mimeType, count]) => {
    if (mimeType.startsWith('image/')) {
      fileTypeGroups.images += count;
    } else if (mimeType.startsWith('video/')) {
      fileTypeGroups.videos += count;
    } else if (
      mimeType.includes('pdf') ||
      mimeType.includes('document') ||
      mimeType.includes('spreadsheet') ||
      mimeType.includes('presentation') ||
      mimeType.includes('text/plain') ||
      mimeType.includes('application/msword') ||
      mimeType.includes('application/vnd.openxmlformats')
    ) {
      fileTypeGroups.documents += count;
    } else if (
      mimeType.includes('javascript') ||
      mimeType.includes('typescript') ||
      mimeType.includes('json') ||
      mimeType.includes('xml') ||
      mimeType.includes('html') ||
      mimeType.includes('css') ||
      mimeType.includes('text/') ||
      mimeType.includes('application/json') ||
      mimeType.includes('application/xml')
    ) {
      fileTypeGroups.code += count;
    } else if (
      mimeType.includes('zip') ||
      mimeType.includes('tar') ||
      mimeType.includes('gz') ||
      mimeType.includes('rar') ||
      mimeType.includes('7z')
    ) {
      fileTypeGroups.archives += count;
    } else {
      fileTypeGroups.other += count;
    }
  });
  
  // Get top file types by count
  const topFileTypes = Object.entries(fileTypes)
    .map(([type, count]) => ({
      type: type.split('/').pop() || type,
      count,
      size: typeSizes[type] || 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // Determine purpose
  let purpose = 'Unknown';
  const likelyProject = 
    fileTypeGroups.code > files.length * 0.3 ||
    folder.name.includes('node_modules') ||
    folder.name.includes('src') ||
    folder.name.includes('lib') ||
    children.some(c => c.name === 'package.json' || c.name === '.git' || c.name === 'README.md');
  
  const likelyBackup =
    folder.name.toLowerCase().includes('backup') ||
    folder.name.toLowerCase().includes('archive') ||
    fileTypeGroups.archives > files.length * 0.5 ||
    (fileTypeGroups.documents > files.length * 0.7 && files.length > 10);
  
  const likelyMedia =
    (fileTypeGroups.images + fileTypeGroups.videos) > files.length * 0.6;
  
  if (likelyProject) {
    purpose = 'Code Project';
    if (folder.name.includes('node_modules')) {
      purpose = 'Node.js Dependencies';
    }
  } else if (likelyMedia) {
    if (fileTypeGroups.images > fileTypeGroups.videos) {
      purpose = 'Photo Collection';
    } else {
      purpose = 'Video Collection';
    }
  } else if (likelyBackup) {
    purpose = 'Backup/Archive';
  } else if (fileTypeGroups.documents > files.length * 0.7) {
    purpose = 'Documents';
  } else if (subfolders.length > files.length) {
    purpose = 'Folder Structure';
  } else if (files.length === 0 && subfolders.length > 0) {
    purpose = 'Container Folder';
  } else {
    purpose = 'Mixed Content';
  }
  
  return {
    totalFiles: files.length,
    totalFolders: subfolders.length,
    totalSize: folder.calculatedSize || folder.size || 0,
    fileTypes,
    fileTypeGroups,
    topFileTypes,
    purpose,
    likelyProject,
    likelyBackup,
    likelyMedia,
  };
}

/**
 * Get human-readable description of folder contents
 */
export function getFolderDescription(summary: FolderContentSummary): string {
  const parts: string[] = [];
  
  if (summary.totalFiles > 0) {
    parts.push(`${summary.totalFiles} file${summary.totalFiles !== 1 ? 's' : ''}`);
  }
  
  if (summary.totalFolders > 0) {
    parts.push(`${summary.totalFolders} folder${summary.totalFolders !== 1 ? 's' : ''}`);
  }
  
  const typeParts: string[] = [];
  if (summary.fileTypeGroups.images > 0) {
    typeParts.push(`${summary.fileTypeGroups.images} image${summary.fileTypeGroups.images !== 1 ? 's' : ''}`);
  }
  if (summary.fileTypeGroups.videos > 0) {
    typeParts.push(`${summary.fileTypeGroups.videos} video${summary.fileTypeGroups.videos !== 1 ? 's' : ''}`);
  }
  if (summary.fileTypeGroups.code > 0) {
    typeParts.push(`${summary.fileTypeGroups.code} code file${summary.fileTypeGroups.code !== 1 ? 's' : ''}`);
  }
  if (summary.fileTypeGroups.documents > 0) {
    typeParts.push(`${summary.fileTypeGroups.documents} document${summary.fileTypeGroups.documents !== 1 ? 's' : ''}`);
  }
  
  if (typeParts.length > 0) {
    parts.push(`(${typeParts.join(', ')})`);
  }
  
  return parts.join(' • ');
}
