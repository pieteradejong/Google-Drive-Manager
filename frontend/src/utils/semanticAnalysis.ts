/** Semantic analysis utilities for categorizing folders by purpose */
import type { FileItem } from '../types/drive';
import { measureSync } from './performance';

export interface SemanticCategory {
  name: string;
  patterns: RegExp[];
  keywords: string[];
  color: string;
  icon?: string;
}

export const SEMANTIC_CATEGORIES: SemanticCategory[] = [
  {
    name: 'Backup/Archive',
    patterns: [/backup/i, /archive/i, /old/i, /legacy/i, /old_/i, /oldbackup/i, /bak/i],
    keywords: ['backup', 'backup_', 'old', 'old_', 'archive', 'legacy', 'bak', 'oldbackup'],
    color: '#ef4444',
    icon: '📦'
  },
  {
    name: 'Photos',
    patterns: [/photo/i, /picture/i, /image/i, /camera/i, /pic/i, /pics/i, /img/i, /images/i],
    keywords: ['photo', 'photos', 'picture', 'pictures', 'images', 'camera', 'pic', 'pics', 'img'],
    color: '#10b981',
    icon: '📷'
  },
  {
    name: 'Work',
    patterns: [/work/i, /business/i, /client/i, /project/i, /projects/i, /office/i, /corporate/i],
    keywords: ['work', 'business', 'client', 'project', 'projects', 'office', 'corporate', 'job'],
    color: '#3b82f6',
    icon: '💼'
  },
  {
    name: 'Personal',
    patterns: [/personal/i, /home/i, /family/i, /private/i, /my/i, /self/i],
    keywords: ['personal', 'home', 'family', 'private', 'my', 'self'],
    color: '#8b5cf6',
    icon: '👤'
  },
  {
    name: 'Documents',
    patterns: [/document/i, /doc/i, /documents/i, /files/i, /paperwork/i],
    keywords: ['document', 'doc', 'documents', 'files', 'paperwork'],
    color: '#f59e0b',
    icon: '📄'
  },
  {
    name: 'Music',
    patterns: [/music/i, /audio/i, /song/i, /songs/i, /mp3/i, /sound/i],
    keywords: ['music', 'audio', 'song', 'songs', 'mp3', 'sound', 'tunes'],
    color: '#ec4899',
    icon: '🎵'
  },
  {
    name: 'Videos',
    patterns: [/video/i, /movie/i, /movies/i, /film/i, /films/i, /videos/i],
    keywords: ['video', 'videos', 'movie', 'movies', 'film', 'films'],
    color: '#06b6d4',
    icon: '🎬'
  },
  {
    name: 'Downloads',
    patterns: [/download/i, /downloaded/i, /temp/i, /tmp/i],
    keywords: ['download', 'downloaded', 'temp', 'tmp'],
    color: '#84cc16',
    icon: '⬇️'
  },
  {
    name: 'Code',
    patterns: [/code/i, /dev/i, /development/i, /src/i, /source/i, /script/i, /scripts/i],
    keywords: ['code', 'dev', 'development', 'src', 'source', 'script', 'scripts', 'programming'],
    color: '#6366f1',
    icon: '💻'
  },
  {
    name: 'School',
    patterns: [/school/i, /education/i, /study/i, /studies/i, /course/i, /courses/i, /class/i],
    keywords: ['school', 'education', 'study', 'studies', 'course', 'courses', 'class', 'university'],
    color: '#14b8a6',
    icon: '🎓'
  }
];

/**
 * Classify a folder by its name using pattern matching
 */
export function classifyFolderByName(folderName: string): SemanticCategory | null {
  const lowerName = folderName.toLowerCase();
  
  for (const category of SEMANTIC_CATEGORIES) {
    // Check keywords first (exact substring match)
    for (const keyword of category.keywords) {
      if (lowerName.includes(keyword.toLowerCase())) {
        return category;
      }
    }
    
    // Check regex patterns
    for (const pattern of category.patterns) {
      if (pattern.test(folderName)) {
        return category;
      }
    }
  }
  
  return null;
}

/**
 * Analyze folder contents to determine semantic category
 */
export function classifyFolderByContent(
  _folder: FileItem, // Reserved for future folder-name-based classification
  childIds: string[],
  fileMap: Map<string, FileItem>
): SemanticCategory | null {
  if (childIds.length === 0) return null;
  
  const now = Date.now();
  const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
  
  // Count file types
  const typeCounts: Record<string, number> = {};
  let imageCount = 0;
  let oldFileCount = 0;
  let totalFiles = 0;
  
  childIds.forEach(childId => {
    const child = fileMap.get(childId);
    if (!child) return;
    
    // Skip subfolders for this analysis
    if (child.mimeType === 'application/vnd.google-apps.folder') return;
    
    totalFiles++;
    
    // Count by MIME type category
    if (child.mimeType.startsWith('image/')) {
      imageCount++;
      typeCounts['image'] = (typeCounts['image'] || 0) + 1;
    } else if (child.mimeType.startsWith('video/')) {
      typeCounts['video'] = (typeCounts['video'] || 0) + 1;
    } else if (child.mimeType.startsWith('audio/')) {
      typeCounts['audio'] = (typeCounts['audio'] || 0) + 1;
    } else if (child.mimeType.includes('document') || child.mimeType.includes('pdf')) {
      typeCounts['document'] = (typeCounts['document'] || 0) + 1;
    }
    
    // Check if file is old (1+ years)
    if (child.modifiedTime) {
      const modifiedTime = new Date(child.modifiedTime).getTime();
      if (modifiedTime < oneYearAgo) {
        oldFileCount++;
      }
    }
  });
  
  if (totalFiles === 0) return null;
  
  const imageRatio = imageCount / totalFiles;
  const oldFileRatio = oldFileCount / totalFiles;
  
  // >80% images → Photo Collection
  if (imageRatio > 0.8) {
    return SEMANTIC_CATEGORIES.find(c => c.name === 'Photos') || null;
  }
  
  // >80% old files → Archive
  if (oldFileRatio > 0.8) {
    return SEMANTIC_CATEGORIES.find(c => c.name === 'Backup/Archive') || null;
  }
  
  // >80% videos → Videos category
  if (typeCounts['video'] && typeCounts['video'] / totalFiles > 0.8) {
    return SEMANTIC_CATEGORIES.find(c => c.name === 'Videos') || null;
  }
  
  // >80% audio → Music category
  if (typeCounts['audio'] && typeCounts['audio'] / totalFiles > 0.8) {
    return SEMANTIC_CATEGORIES.find(c => c.name === 'Music') || null;
  }
  
  return null;
}

/**
 * Classify a folder using both name and content analysis
 * Priority: name pattern > content analysis
 */
export function classifyFolder(
  folder: FileItem,
  childIds: string[],
  fileMap: Map<string, FileItem>
): { category: SemanticCategory; confidence: 'high' | 'medium' | 'low'; method: 'name' | 'content' } | null {
  // Try name first (higher confidence)
  const nameCategory = classifyFolderByName(folder.name);
  if (nameCategory) {
    return {
      category: nameCategory,
      confidence: 'high',
      method: 'name'
    };
  }
  
  // Try content analysis
  const contentCategory = classifyFolderByContent(folder, childIds, fileMap);
  if (contentCategory) {
    return {
      category: contentCategory,
      confidence: 'medium',
      method: 'content'
    };
  }
  
  return null;
}

/**
 * Group all folders into semantic categories
 */
export function groupFoldersBySemantic(
  folders: FileItem[],
  allFiles: FileItem[],
  childrenMap: Record<string, string[]>
): {
  categorized: Record<string, { folders: FileItem[]; totalSize: number; classifications: Array<{ folder: FileItem; confidence: string; method: string }> }>;
  uncategorized: FileItem[];
} {
  return measureSync('semanticAnalysis: groupFoldersBySemantic', () => {
  const fileMap = new Map(allFiles.map(f => [f.id, f]));
  const categorized: Record<string, {
    folders: FileItem[];
    totalSize: number;
    classifications: Array<{ folder: FileItem; confidence: string; method: string }>;
  }> = {};
  
  const uncategorized: FileItem[] = [];
  
  // Initialize all categories
  SEMANTIC_CATEGORIES.forEach(cat => {
    categorized[cat.name] = {
      folders: [],
      totalSize: 0,
      classifications: []
    };
  });
  
  folders.forEach(folder => {
    const childIds = childrenMap[folder.id] || [];
    const classification = classifyFolder(folder, childIds, fileMap);
    
    if (classification) {
      const category = categorized[classification.category.name];
      category.folders.push(folder);
      category.totalSize += folder.calculatedSize || folder.size || 0;
      category.classifications.push({
        folder,
        confidence: classification.confidence,
        method: classification.method
      });
    } else {
      uncategorized.push(folder);
    }
  });
  
    return { categorized, uncategorized };
  }, 500); // Warn if >500ms
}

/**
 * Get semantic category by name
 */
export function getCategoryByName(name: string): SemanticCategory | undefined {
  return SEMANTIC_CATEGORIES.find(cat => cat.name === name);
}

/**
 * Calculate statistics for semantic categories
 */
export function calculateSemanticStats(
  categorized: Record<string, { folders: FileItem[]; totalSize: number }>,
  totalSize: number
): Array<{ name: string; folderCount: number; totalSize: number; percentage: number; color: string }> {
  return Object.entries(categorized)
    .map(([name, data]) => ({
      name,
      folderCount: data.folders.length,
      totalSize: data.totalSize,
      percentage: totalSize > 0 ? (data.totalSize / totalSize) * 100 : 0,
      color: getCategoryByName(name)?.color || '#6b7280'
    }))
    .filter(stat => stat.folderCount > 0)
    .sort((a, b) => b.totalSize - a.totalSize);
}
