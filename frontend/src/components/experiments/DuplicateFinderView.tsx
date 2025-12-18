/** Duplicate File Finder - Find files with same name and size, showing full paths and metadata */
import { useMemo, useState } from 'react';
import { File, Folder, Copy, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import { LoadingState } from '../LoadingState';
import { useAnalyticsView } from '../../hooks/useAnalytics';
import type { FileItem } from '../../types/drive';

interface DuplicateFinderViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

interface DuplicateGroup {
  name: string;
  size: number;
  potentialSavings: number;
  // Metadata comparison for verification
  identicalMetadata: boolean; // All files have same name, size, mimeType, created/modified times
  file_ids: string[];
  count: number;
  mimeType?: string;
}

export const DuplicateFinderView = ({ files, childrenMap, onFileClick }: DuplicateFinderViewProps) => {
  void files; // analytics provides precomputed duplicate data
  void childrenMap; // reserved for future (e.g. folder duplicate detection)
  const [minGroupSize, setMinGroupSize] = useState<number>(2);
  const [minFileSizeMB, setMinFileSizeMB] = useState<number>(0);
  const analyticsQuery = useAnalyticsView('duplicates', { limit: 1000, offset: 0 }, true);
  const analytics = (analyticsQuery.data as any)?.data;
  
  // Memoize to avoid creating new arrays on every render
  const serverGroups = useMemo(() => {
    return (analytics?.groups || []) as DuplicateGroup[];
  }, [analytics?.groups]);
  
  const serverFiles = useMemo(() => {
    return (analytics?.files || []) as Array<FileItem & { path?: string }>;
  }, [analytics?.files]);

  const fileById = useMemo(() => {
    const map = new Map<string, any>();
    serverFiles.forEach((f) => map.set(f.id, f));
    return map;
  }, [serverFiles]);

  const minSizeBytes = minFileSizeMB * 1024 * 1024;

  const filteredGroups = useMemo(() => {
    return serverGroups.filter((g) => {
      const countOk = (g.count ?? g.file_ids?.length ?? 0) >= minGroupSize;
      const sizeOk = (g.size ?? 0) >= minSizeBytes;
      return countOk && sizeOk;
    });
  }, [serverGroups, minGroupSize, minSizeBytes]);

  const totalPotentialSavings = useMemo(() => {
    return filteredGroups.reduce((sum, g) => sum + (g.potentialSavings || 0), 0);
  }, [filteredGroups]);

  if (analyticsQuery.isLoading || analyticsQuery.isFetching) {
    return (
      <LoadingState
        operation="Preparing duplicate analysis"
        details="Loading cached duplicate groups from server..."
      />
    );
  }

  if (analyticsQuery.error) {
    return (
      <div className="p-6 text-sm text-red-700">
        Failed to load duplicate analytics. Try again in a moment.
      </div>
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
            {filteredGroups.length} duplicate group{filteredGroups.length !== 1 ? 's' : ''} shown
          </div>
        </div>
      </div>
      
      {/* Duplicate Groups */}
      <div className="flex-1 overflow-auto p-6">
        {filteredGroups.length === 0 ? (
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
            {filteredGroups.map((group) => (
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
                      {group.count} copies • {formatSize(group.size)} each • {group.mimeType || 'Unknown type'}
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
                  {(group.file_ids || []).map((fileId, fileIndex) => {
                    const file = fileById.get(fileId);
                    if (!file) return null;
                    const pathString = file.path || 'Root';
                    return (
                      <div
                        key={fileId}
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
