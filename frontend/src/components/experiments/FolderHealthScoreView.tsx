/** Folder Health Score - Identify problematic folders */
import { useMemo, useState } from 'react';
import { Activity, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import { measureSync } from '../../utils/performance';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface FolderHealthScoreViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

interface FolderHealth {
  folder: FileItem;
  score: number;
  issues: string[];
  depth: number;
  fileCount: number;
  avgFileAge: number;
}

const calculateDepth = (
  fileId: string,
  files: FileItem[],
  childrenMap: Record<string, string[]>,
  visited: Set<string> = new Set(),
  maxDepth: number = 50
): number => {
  if (visited.has(fileId) || maxDepth <= 0) return 0;
  const file = files.find(f => f.id === fileId);
  if (!file || file.parents.length === 0) return 0;
  visited.add(fileId);
  const parent = file.parents[0];
  return 1 + calculateDepth(parent, files, childrenMap, visited, maxDepth - 1);
};

export const FolderHealthScoreView = ({ files, childrenMap, onFileClick }: FolderHealthScoreViewProps) => {
  const [sortBy, setSortBy] = useState<'score' | 'size' | 'files'>('score');
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Calculate health scores for all folders
  const folderHealth = useMemo(() => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    const result = measureSync('FolderHealthScoreView: calculateHealthScores', () => {
    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const now = Date.now();
    
    return folders.map(folder => {
      const issues: string[] = [];
      let score = 100;
      
      // Calculate depth
      const depth = calculateDepth(folder.id, files, childrenMap);
      if (depth > 10) {
        issues.push(`Very deep (${depth} levels)`);
        score -= 20;
      } else if (depth > 5) {
        issues.push(`Deep hierarchy (${depth} levels)`);
        score -= 10;
      }
      
      // Count files in folder
      const childIds = childrenMap[folder.id] || [];
      const childFiles = files.filter(f => childIds.includes(f.id));
      const fileCount = childFiles.length;
      
      if (fileCount > 1000) {
        issues.push(`Many files (${fileCount})`);
        score -= 15;
      } else if (fileCount > 500) {
        issues.push(`Large file count (${fileCount})`);
        score -= 10;
      }
      
      // Calculate average file age
      const filesWithDates = childFiles.filter(f => f.modifiedTime);
      const avgFileAge = filesWithDates.length > 0
        ? filesWithDates.reduce((sum, f) => {
            const age = (now - new Date(f.modifiedTime!).getTime()) / (1000 * 60 * 60 * 24);
            return sum + age;
          }, 0) / filesWithDates.length
        : 0;
      
      if (avgFileAge > 365) {
        issues.push(`Old files (avg ${Math.floor(avgFileAge)} days)`);
        score -= 10;
      }
      
      // Size check
      const size = folder.calculatedSize || 0;
      if (size > 10 * 1024 * 1024 * 1024) { // > 10GB
        issues.push(`Very large (${formatSize(size)})`);
        score -= 5;
      }
      
      // Many small files
      const avgFileSize = fileCount > 0 ? size / fileCount : 0;
      if (fileCount > 100 && avgFileSize < 1024) { // Many files < 1KB
        issues.push(`Many small files`);
        score -= 5;
      }
      
      score = Math.max(0, score);
      
      return {
        folder,
        score,
        issues,
        depth,
        fileCount,
        avgFileAge
      } as FolderHealth;
    });
    }, 500);
    
    setAnalysisProgress(100);
    setTimeout(() => {
      setIsAnalyzing(false);
    }, 200);
    
    return result;
  }, [files, childrenMap]);
  
  // Sort folders (must be before early return to follow Rules of Hooks)
  const sortedFolders = useMemo(() => {
    if (!folderHealth) return [];
    const sorted = [...folderHealth];
    if (sortBy === 'score') {
      sorted.sort((a, b) => a.score - b.score); // Lowest score first (most problematic)
    } else if (sortBy === 'size') {
      sorted.sort((a, b) => (b.folder.calculatedSize || 0) - (a.folder.calculatedSize || 0));
    } else {
      sorted.sort((a, b) => b.fileCount - a.fileCount);
    }
    return sorted.slice(0, 100); // Limit to top 100
  }, [folderHealth, sortBy]);
  
  // Show loading state during analysis
  if (isAnalyzing) {
    const folderCount = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length;
    return (
      <LoadingState
        operation="Calculating folder health scores"
        details={`Analyzing ${folderCount.toLocaleString()} folders for issues...`}
        progress={analysisProgress}
      />
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <CheckCircle className="text-green-600" size={20} />;
    if (score >= 60) return <AlertCircle className="text-yellow-600" size={20} />;
    return <XCircle className="text-red-600" size={20} />;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Folder Health Score</h2>
            <p className="text-sm text-gray-600 mt-1">
              Identify folders with potential issues (deep hierarchy, many files, old files, etc.)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'score' | 'size' | 'files')}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="score">Health Score</option>
              <option value="size">Size</option>
              <option value="files">File Count</option>
            </select>
          </div>
        </div>
      </div>

      {/* Health Distribution */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-sm text-gray-600">Healthy (80+)</div>
            <div className="text-lg font-semibold text-green-600">
              {folderHealth.filter(f => f.score >= 80).length}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Warning (60-79)</div>
            <div className="text-lg font-semibold text-yellow-600">
              {folderHealth.filter(f => f.score >= 60 && f.score < 80).length}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Issues (&lt;60)</div>
            <div className="text-lg font-semibold text-red-600">
              {folderHealth.filter(f => f.score < 60).length}
            </div>
          </div>
        </div>
      </div>

      {/* Folders List */}
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-3">
          {sortedFolders.map((health) => (
            <div
              key={health.folder.id}
              onClick={() => onFileClick?.(health.folder)}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getScoreIcon(health.score)}
                    <span className="font-semibold">{health.folder.name}</span>
                    <span className={`text-sm font-medium ${getScoreColor(health.score)}`}>
                      Score: {health.score}/100
                    </span>
                  </div>
                  
                  {health.issues.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {health.issues.map((issue, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded"
                        >
                          {issue}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="text-right text-sm text-gray-600 ml-4">
                  <div>{formatSize(health.folder.calculatedSize || 0)}</div>
                  <div>{health.fileCount} files</div>
                  <div>Depth: {health.depth}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {folderHealth.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <Activity size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium">No folders to analyze</p>
          </div>
        )}
      </div>
    </div>
  );
};
