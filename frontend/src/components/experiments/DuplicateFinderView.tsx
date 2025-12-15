/** Duplicate File Finder - Find files with same name and size, showing full paths and metadata */
import { useMemo, useState, useEffect } from 'react';
import { File, Folder, Copy, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { formatSize, getFolderPath } from '../../utils/navigation';
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
  void childrenMap; // reserved for future (e.g. folder duplicate detection)
  const [minGroupSize, setMinGroupSize] = useState<number>(2);
  const [minFileSizeMB, setMinFileSizeMB] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(true);
  const [processProgress, setProcessProgress] = useState(0);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  
  // Find duplicates in small chunks to avoid blocking the UI thread
  useEffect(() => {
    let cancelled = false;

    const sleep = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

    const run = async () => {
      setIsProcessing(true);
      setProcessProgress(0);
      setDuplicateGroups([]);

      const startedAt = performance.now();

      // Pre-filter: only non-folders and above min size
      const candidateFiles = files.filter(f => {
        if (f.mimeType === 'application/vnd.google-apps.folder') return false;
        const size = f.size || 0;
        const sizeMB = size / (1024 * 1024);
        return sizeMB >= minFileSizeMB;
      });

      const total = candidateFiles.length;
      const groupsMap = new Map<string, FileItem[]>();
      // Smaller chunks keep the main thread responsive even on slower machines
      const chunkSize = 500;

      // Phase 1: build grouping map
      for (let i = 0; i < total; i += chunkSize) {
        if (cancelled) return;

        const end = Math.min(i + chunkSize, total);
        for (let j = i; j < end; j++) {
          const file = candidateFiles[j];
          const size = file.size || 0;
          const key = `${file.name}|${size}`;
          const list = groupsMap.get(key);
          if (list) list.push(file);
          else groupsMap.set(key, [file]);
        }

        // 0–90% progress
        const pct = total === 0 ? 90 : Math.min(90, (end / total) * 90);
        setProcessProgress(pct);
        // Yield to let the browser paint / keep responsive
        await sleep(0);
      }

      // Phase 2: convert map -> groups
      const entries = Array.from(groupsMap.entries());
      const groups: DuplicateGroup[] = [];
      const totalEntries = entries.length;

      for (let i = 0; i < totalEntries; i += chunkSize) {
        if (cancelled) return;

        const end = Math.min(i + chunkSize, totalEntries);
        for (let j = i; j < end; j++) {
          const [key, fileList] = entries[j];
          if (fileList.length < minGroupSize) continue;

          const sepIndex = key.lastIndexOf('|');
          const name = sepIndex >= 0 ? key.slice(0, sepIndex) : key;
          const sizeStr = sepIndex >= 0 ? key.slice(sepIndex + 1) : '0';
          const size = parseInt(sizeStr, 10) || 0;

          const potentialSavings = (fileList.length - 1) * size;

          const firstFile = fileList[0];
          const identicalMetadata = fileList.every(file =>
            file.name === firstFile.name &&
            (file.size || 0) === (firstFile.size || 0) &&
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

        // 90–95% progress
        const pct = totalEntries === 0 ? 95 : 90 + Math.min(5, (end / totalEntries) * 5);
        setProcessProgress(pct);
        await sleep(0);
      }

      // Phase 3: sort (can still be noticeable, but is much smaller than scanning all files)
      groups.sort((a, b) => b.potentialSavings - a.potentialSavings);

      if (cancelled) return;
      setDuplicateGroups(groups);
      setProcessProgress(100);
      setIsProcessing(false);

      const durationMs = performance.now() - startedAt;
      // Useful diagnostic without being too noisy
      if (durationMs > 1000) {
        console.warn(`[Performance] DuplicateFinderView computed in ${durationMs.toFixed(0)}ms`, {
          candidates: total,
          groups: groups.length
        });
      }
    };

    run();
    return () => {
      cancelled = true;
    };
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
            {duplicateGroups.map((group) => (
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
