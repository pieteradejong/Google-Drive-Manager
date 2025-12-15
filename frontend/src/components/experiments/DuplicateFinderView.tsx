/** Duplicate File Finder - Find files with same name and size, showing full paths and metadata */
import { useMemo, useState, useEffect } from 'react';
import { File, Folder, Copy, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { formatSize, getFolderPath } from '../../utils/navigation';
import { measureSync } from '../../utils/performance';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface DuplicateFinderViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

interface DuplicateGroup {
  name: string;
  size: number;
  files: FileItem[];
  potentialSavings: number;
  // Metadata comparison for verification
  identicalMetadata: boolean; // All files have same name, size, mimeType, created/modified times
}

export const DuplicateFinderView = ({ files, childrenMap, onFileClick }: DuplicateFinderViewProps) => {
  const [minGroupSize, setMinGroupSize] = useState<number>(2);
  const [minFileSizeMB, setMinFileSizeMB] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(true);
  const [processProgress, setProcessProgress] = useState(0);
  
  // Find duplicates: group by name + size
  const duplicateGroups = useMemo(() => {
    setIsProcessing(true);
    setProcessProgress(0);
    
    const result = measureSync('DuplicateFinderView: findDuplicates', () => {
      // Create a map: "name|size" -> [files]
      const groupsMap = new Map<string, FileItem[]>();
      const totalFiles = files.length;
      let processed = 0;
      
      files.forEach(file => {
        // Skip folders for now (could add folder duplicate detection later)
        if (file.mimeType === 'application/vnd.google-apps.folder') return;
        
        const size = file.size || 0;
        const sizeMB = size / (1024 * 1024);
        
        // Filter by minimum file size
        if (sizeMB < minFileSizeMB) return;
        
        const key = `${file.name}|${size}`;
        if (!groupsMap.has(key)) {
          groupsMap.set(key, []);
        }
        groupsMap.get(key)!.push(file);
        
        // Update progress every 1000 files
        processed++;
        if (processed % 1000 === 0) {
          setProcessProgress(Math.min(90, (processed / totalFiles) * 90));
        }
      });
      
      setProcessProgress(90);
      
      // Convert to array and filter by minimum group size
      const groups: DuplicateGroup[] = [];
      groupsMap.forEach((fileList, key) => {
        if (fileList.length >= minGroupSize) {
          const [name, sizeStr] = key.split('|');
          const size = parseInt(sizeStr);
          // Potential savings: (count - 1) * size (keep one, delete rest)
          const potentialSavings = (fileList.length - 1) * size;
          
          // Check if all files have identical metadata (name, size, mimeType, dates)
          const firstFile = fileList[0];
          const identicalMetadata = fileList.every(file => 
            file.name === firstFile.name &&
            file.size === firstFile.size &&
            file.mimeType === firstFile.mimeType &&
            file.createdTime === firstFile.createdTime &&
            file.modifiedTime === firstFile.modifiedTime
          );
          
          groups.push({
            name,
            size,
            files: fileList,
            potentialSavings,
            identicalMetadata
          });
        }
      });
      
      setProcessProgress(95);
      
      // Sort by potential savings (largest first)
      return groups.sort((a, b) => b.potentialSavings - a.potentialSavings);
    }, 500);
    
    setProcessProgress(100);
    setTimeout(() => {
      setIsProcessing(false);
    }, 200);
    
    return result;
  }, [files, minGroupSize, minFileSizeMB]);
  
  // Memoize folder paths to avoid recalculating on every render
  const pathCache = useMemo(() => {
    const cache = new Map<string, FileItem[]>();
    duplicateGroups.forEach(group => {
      group.files.forEach(file => {
        if (!cache.has(file.id)) {
          const parentFolderId = file.parents.length > 0 ? file.parents[0] : null;
          cache.set(file.id, getFolderPath(parentFolderId, files));
        }
      });
    });
    return cache;
  }, [duplicateGroups, files]);
  
  // Calculate total potential savings
  const totalPotentialSavings = useMemo(() => {
    return duplicateGroups.reduce((sum, group) => sum + group.potentialSavings, 0);
  }, [duplicateGroups]);
  
  // Get full folder path for a file (from cache)
  const getFullPath = (file: FileItem): FileItem[] => {
    return pathCache.get(file.id) || [];
  };
  
  // Format path as string
  const formatPath = (path: FileItem[]): string => {
    if (path.length === 0) return 'Root';
    return '/' + path.map(f => f.name).join('/');
  };
  
  // Show loading state during processing
  if (isProcessing) {
    const fileCount = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').length;
    return (
      <LoadingState
        operation="Finding duplicate files"
        details={`Analyzing ${fileCount.toLocaleString()} files for duplicates...`}
        progress={processProgress}
      />
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Header with stats */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">Duplicate File Finder</h2>
            <p className="text-sm text-gray-600 mt-1">
              Find files with the same name and size (potential duplicates)
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-600">
              {formatSize(totalPotentialSavings)}
            </div>
            <div className="text-sm text-gray-600">Potential space savings</div>
          </div>
        </div>
        
        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Min duplicates:</label>
            <input
              type="number"
              min="2"
              value={minGroupSize}
              onChange={(e) => setMinGroupSize(parseInt(e.target.value) || 2)}
              className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Min file size (MB):</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={minFileSizeMB}
              onChange={(e) => setMinFileSizeMB(parseFloat(e.target.value) || 0)}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          
          <div className="text-sm text-gray-600">
            {duplicateGroups.length} duplicate group{duplicateGroups.length !== 1 ? 's' : ''} found
          </div>
        </div>
      </div>
      
      {/* Duplicate Groups */}
      <div className="flex-1 overflow-auto p-6">
        {duplicateGroups.length === 0 ? (
          <div className="text-center text-gray-500 mt-12">
            <Copy size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">No duplicates found</p>
            <p className="text-sm">
              {minGroupSize > 2 || minFileSizeMB > 0 
                ? 'Try adjusting the filters above'
                : 'Great! No duplicate files detected'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {duplicateGroups.map((group, groupIndex) => (
              <div key={`${group.name}-${group.size}`} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Copy size={20} className="text-blue-500" />
                        {group.name}
                      </h3>
                      {group.identicalMetadata ? (
                        <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded" title="All files have identical metadata (name, size, type, dates)">
                          <CheckCircle2 size={12} />
                          Verified identical
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded" title="Files have same name and size but different metadata - verify manually">
                          <XCircle size={12} />
                          Check metadata
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {group.files.length} copies • {formatSize(group.size)} each • {group.files[0]?.mimeType || 'Unknown type'}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600">
                      {formatSize(group.potentialSavings)}
                    </div>
                    <div className="text-xs text-gray-500">can be freed</div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {group.files.map((file, fileIndex) => {
                    const path = getFullPath(file);
                    const pathString = formatPath(path);
                    return (
                      <div
                        key={file.id}
                        onClick={() => onFileClick?.(file)}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <File size={18} className="text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{file.name}</div>
                            <div className="text-xs text-gray-500 space-y-0.5 mt-1">
                              <div className="flex items-center gap-1 truncate">
                                <Folder size={12} />
                                <span className="truncate" title={pathString}>{pathString}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                {file.createdTime && (
                                  <span>Created: {new Date(file.createdTime).toLocaleDateString()}</span>
                                )}
                                {file.modifiedTime && (
                                  <span>Modified: {new Date(file.modifiedTime).toLocaleDateString()}</span>
                                )}
                                {file.mimeType && (
                                  <span className="text-gray-400">• {file.mimeType.split('/')[1] || file.mimeType}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                          {fileIndex === 0 && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded whitespace-nowrap">
                              Keep this one
                            </span>
                          )}
                          {fileIndex > 0 && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded flex items-center gap-1 whitespace-nowrap">
                              <Trash2 size={12} />
                              Can delete
                            </span>
                          )}
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:text-blue-800 text-sm whitespace-nowrap"
                          >
                            Open →
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
