/** Duplicate File Finder - Find files with verified (md5) or potential (name+size) duplicates */
import { useMemo, useState } from 'react';
import { File, Folder, Copy, Trash2, CheckCircle2, AlertTriangle, Shield, FolderOpen } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import { LoadingState } from '../LoadingState';
import { useAnalyticsView } from '../../hooks/useAnalytics';
import type { FileItem, DuplicateGroup } from '../../types/drive';

interface DuplicateFinderViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
  onNavigateToFolder?: (folderId: string) => void;
}

type ViewTab = 'all' | 'verified' | 'potential';

export const DuplicateFinderView = ({ 
  files, 
  childrenMap, 
  onFileClick,
  onNavigateToFolder 
}: DuplicateFinderViewProps) => {
  void files; // analytics provides precomputed duplicate data
  void childrenMap; // reserved for future (e.g. folder duplicate detection)
  
  const [minGroupSize, setMinGroupSize] = useState<number>(2);
  const [minFileSizeMB, setMinFileSizeMB] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<ViewTab>('all');
  
  const analyticsQuery = useAnalyticsView('duplicates', { limit: 1000, offset: 0 }, true);
  const analytics = (analyticsQuery.data as any)?.data;
  
  // Extract verified and potential groups from the response
  const verifiedGroups = useMemo(() => {
    return (analytics?.verified_groups || []) as DuplicateGroup[];
  }, [analytics?.verified_groups]);
  
  const potentialGroups = useMemo(() => {
    return (analytics?.potential_groups || []) as DuplicateGroup[];
  }, [analytics?.potential_groups]);
  
  // Fallback to legacy 'groups' if new format not available
  const allGroups = useMemo(() => {
    if (verifiedGroups.length > 0 || potentialGroups.length > 0) {
      return [...verifiedGroups, ...potentialGroups];
    }
    return (analytics?.groups || []) as DuplicateGroup[];
  }, [analytics?.groups, verifiedGroups, potentialGroups]);
  
  const serverFiles = useMemo(() => {
    return (analytics?.files || []) as Array<FileItem & { path?: string; parentFolderId?: string }>;
  }, [analytics?.files]);

  const fileById = useMemo(() => {
    const map = new Map<string, FileItem & { path?: string; parentFolderId?: string }>();
    serverFiles.forEach((f) => map.set(f.id, f));
    return map;
  }, [serverFiles]);

  const minSizeBytes = minFileSizeMB * 1024 * 1024;

  // Filter function for groups
  const filterGroups = (groups: DuplicateGroup[]) => {
    return groups.filter((g) => {
      const countOk = (g.count ?? g.file_ids?.length ?? 0) >= minGroupSize;
      const sizeOk = (g.size ?? 0) >= minSizeBytes;
      return countOk && sizeOk;
    });
  };

  const filteredVerified = useMemo(() => filterGroups(verifiedGroups), [verifiedGroups, minGroupSize, minSizeBytes]);
  const filteredPotential = useMemo(() => filterGroups(potentialGroups), [potentialGroups, minGroupSize, minSizeBytes]);
  const filteredAll = useMemo(() => filterGroups(allGroups), [allGroups, minGroupSize, minSizeBytes]);

  // Get groups for current tab
  const displayGroups = useMemo(() => {
    switch (activeTab) {
      case 'verified': return filteredVerified;
      case 'potential': return filteredPotential;
      default: return filteredAll;
    }
  }, [activeTab, filteredVerified, filteredPotential, filteredAll]);

  // Calculate savings
  const totalVerifiedSavings = analytics?.total_verified_savings || 
    filteredVerified.reduce((sum, g) => sum + (g.potential_savings || 0), 0);
  const totalPotentialSavings = analytics?.total_potential_savings ||
    filteredPotential.reduce((sum, g) => sum + (g.potential_savings || 0), 0);
  const totalSavings = totalVerifiedSavings + totalPotentialSavings;

  const handleNavigateToFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigateToFolder?.(folderId);
  };

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
              Find verified (identical content) and potential (same name+size) duplicates
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-600">
              {formatSize(totalSavings)}
            </div>
            <div className="text-sm text-gray-600">Total potential savings</div>
            <div className="text-xs text-gray-500 mt-1">
              <span className="text-green-600">{formatSize(totalVerifiedSavings)} verified</span>
              {' • '}
              <span className="text-amber-600">{formatSize(totalPotentialSavings)} potential</span>
            </div>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'all' 
                ? 'bg-blue-100 text-blue-700' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({filteredAll.length})
          </button>
          <button
            onClick={() => setActiveTab('verified')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'verified' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Shield size={14} />
            Verified ({filteredVerified.length})
          </button>
          <button
            onClick={() => setActiveTab('potential')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'potential' 
                ? 'bg-amber-100 text-amber-700' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <AlertTriangle size={14} />
            Potential ({filteredPotential.length})
          </button>
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
            {displayGroups.length} duplicate group{displayGroups.length !== 1 ? 's' : ''} shown
          </div>
        </div>
      </div>
      
      {/* Info banner for current tab */}
      {activeTab === 'verified' && filteredVerified.length > 0 && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-3 flex items-start gap-2">
          <Shield size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-green-800">
            <strong>Verified Duplicates</strong> have identical MD5 checksums, meaning their content is byte-for-byte identical. 
            These are safe to deduplicate.
          </div>
        </div>
      )}
      {activeTab === 'potential' && filteredPotential.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <strong>Potential Duplicates</strong> have the same name and size but cannot be cryptographically verified 
            (Google Docs, Sheets, etc. don't have checksums). Please verify manually before removing.
          </div>
        </div>
      )}
      
      {/* Duplicate Groups */}
      <div className="flex-1 overflow-auto p-6">
        {displayGroups.length === 0 ? (
          <div className="text-center text-gray-500 mt-12">
            <Copy size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">No duplicates found</p>
            <p className="text-sm">
              {minGroupSize > 2 || minFileSizeMB > 0 
                ? 'Try adjusting the filters above'
                : activeTab === 'verified' 
                  ? 'No verified duplicates detected'
                  : activeTab === 'potential'
                    ? 'No potential duplicates detected'
                    : 'Great! No duplicate files detected'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {displayGroups.map((group, groupIndex) => {
              const isVerified = group.confidence === 'verified';
              return (
                <div 
                  key={`${group.name}-${group.size}-${groupIndex}`} 
                  className={`bg-white rounded-lg shadow p-6 ${
                    isVerified ? 'border-l-4 border-green-500' : 'border-l-4 border-amber-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Copy size={20} className="text-blue-500" />
                          {group.name}
                        </h3>
                        {isVerified ? (
                          <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded" title="Files have identical MD5 checksum - guaranteed identical content">
                            <CheckCircle2 size={12} />
                            Verified (md5)
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded" title="Files have same name and size but no checksum available - verify manually">
                            <AlertTriangle size={12} />
                            Potential
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {group.count} copies • {formatSize(group.size)} each • {group.mimeType || 'Unknown type'}
                        {isVerified && group.checksum && (
                          <span className="ml-2 text-gray-400 font-mono text-xs" title={`MD5: ${group.checksum}`}>
                            md5:{group.checksum.slice(0, 8)}...
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${isVerified ? 'text-green-600' : 'text-amber-600'}`}>
                        {formatSize(group.potential_savings)}
                      </div>
                      <div className="text-xs text-gray-500">can be freed</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {(group.file_ids || []).map((fileId, fileIndex) => {
                      const file = fileById.get(fileId);
                      if (!file) return null;
                      const pathString = file.path || 'Root';
                      const parentFolderId = file.parentFolderId;
                      
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
                                <div className="flex items-center gap-1">
                                  <Folder size={12} />
                                  <span className="truncate" title={pathString}>{pathString}</span>
                                  {parentFolderId && onNavigateToFolder && (
                                    <button
                                      onClick={(e) => handleNavigateToFolder(parentFolderId, e)}
                                      className="ml-1 text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                                      title="Navigate to this folder in DAG view"
                                    >
                                      <FolderOpen size={12} />
                                      <span className="text-xs">Go</span>
                                    </button>
                                  )}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
