/** Age + Semantic Analysis View - Combine age buckets with semantic categories */
import { useMemo, useState } from 'react';
import { Folder, Calendar, Filter } from 'lucide-react';
import { formatSize, getFolderPath } from '../../utils/navigation';
import {
  getCategoryByName,
} from '../../utils/semanticAnalysis';
import { useAnalyticsView } from '../../hooks/useAnalytics';
import type { FileItem } from '../../types/drive';

interface AgeSemanticViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

const AGE_BUCKETS = [
  { label: '0-30 days', days: 30, color: '#10b981' },
  { label: '30-90 days', days: 90, color: '#3b82f6' },
  { label: '90-180 days', days: 180, color: '#f59e0b' },
  { label: '180-365 days', days: 365, color: '#ef4444' },
  { label: '365+ days', days: Infinity, color: '#991b1b' },
];

interface MatrixCell {
  category: string;
  ageBucket: string;
  folderCount: number;
  totalSize: number;
}

export const AgeSemanticView = ({ files, childrenMap, onFileClick }: AgeSemanticViewProps) => {
  void childrenMap; // analytics computed server-side
  const [selectedCell, setSelectedCell] = useState<{ category: string; ageBucket: string } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedAgeBucket, setSelectedAgeBucket] = useState<string | null>(null);
  
  // Get all folders
  const folders = useMemo(() => {
    return files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  }, [files]);

  const semanticQuery = useAnalyticsView('semantic', undefined, true);
  const ageSemanticQuery = useAnalyticsView('age_semantic', undefined, true);
  
  // Memoize to avoid creating new object on every render
  const folderCategory = useMemo(() => {
    return (semanticQuery.data as any)?.data?.folder_category || {};
  }, [(semanticQuery.data as any)?.data?.folder_category]) as Record<string, { category: string }>;
  
  const ageSemantic = useMemo(() => {
    return (ageSemanticQuery.data as any)?.data;
  }, [(ageSemanticQuery.data as any)?.data]);

  const categoryNames = useMemo(() => {
    const keys = Object.keys(ageSemantic?.matrix || {});
    return keys.filter(k => k !== 'Uncategorized');
  }, [ageSemantic]);

  const matrixData = useMemo(() => {
    const matrix: MatrixCell[] = [];
    const m = ageSemantic?.matrix || {};
    Object.entries(m).forEach(([category, buckets]) => {
      Object.entries(buckets as any).forEach(([bucketLabel, cell]) => {
        matrix.push({
          category,
          ageBucket: bucketLabel,
          folderCount: (cell as any).folder_count ?? 0,
          totalSize: (cell as any).total_size ?? 0
        });
      });
    });
    return matrix;
  }, [ageSemantic]);
  
  // Get folders for selected cell
  const selectedFolders = useMemo(() => {
    if (!selectedCell) return [];
    const now = Date.now();
    return folders.filter(folder => {
      const cat = folderCategory[folder.id]?.category || 'Uncategorized';
      if (cat !== selectedCell.category) return false;
      const modifiedTime = folder.modifiedTime ? new Date(folder.modifiedTime).getTime() : 0;
      const ageDays = folder.modifiedTime ? (now - modifiedTime) / (1000 * 60 * 60 * 24) : 10_000;
      if (selectedCell.ageBucket === '365+ days') return ageDays >= 365;
      const bucket = AGE_BUCKETS.find(b => b.label === selectedCell.ageBucket);
      if (!bucket || bucket.days === Infinity) return false;
      // bucket.days means "older than"
      if (bucket.label === '0-30 days') return ageDays < 30;
      if (bucket.label === '30-90 days') return ageDays >= 30 && ageDays < 90;
      if (bucket.label === '90-180 days') return ageDays >= 90 && ageDays < 180;
      if (bucket.label === '180-365 days') return ageDays >= 180 && ageDays < 365;
      return false;
    });
  }, [selectedCell, folders, folderCategory]);
  
  // Calculate max size for color intensity
  const maxSize = useMemo(() => {
    return Math.max(...matrixData.map(c => c.totalSize), 1);
  }, [matrixData]);
  
  // Get cell color intensity
  const getCellColor = (cell: MatrixCell): string => {
    const intensity = Math.min(cell.totalSize / maxSize, 1);
    const category = getCategoryByName(cell.category);
    const baseColor = category?.color || '#6b7280';
    
    // Convert hex to RGB
    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);
    
    // Apply intensity (darker = larger)
    const alpha = 0.3 + (intensity * 0.7);
    const newR = Math.floor(r * alpha);
    const newG = Math.floor(g * alpha);
    const newB = Math.floor(b * alpha);
    
    return `rgb(${newR}, ${newG}, ${newB})`;
  };
  
  const isLoading = semanticQuery.isLoading || semanticQuery.isFetching || ageSemanticQuery.isLoading || ageSemanticQuery.isFetching;
  const hasError = Boolean(semanticQuery.error || ageSemanticQuery.error);

  const categoriesShown = useMemo(() => {
    let cats = categoryNames;
    if (selectedCategory) cats = cats.filter(c => c === selectedCategory);
    return cats;
  }, [categoryNames, selectedCategory]);

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Preparing analytics…
      </div>
    );
  }
  if (hasError) {
    return (
      <div className="p-6 text-sm text-red-700">
        Failed to load cached analytics. Try again in a moment.
      </div>
    );
  }
  
  // Format folder path
  const formatFolderPath = (folder: FileItem): string => {
    const path = getFolderPath(folder.parents[0] || null, files);
    if (path.length === 0) return 'Root';
    return '/' + path.map(f => f.name).join('/');
  };
  
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
              <Calendar size={24} />
              Age + Semantic Analysis
            </h2>
            <p className="text-gray-600 text-sm mt-1">
              Combine file age with semantic categorization to find insights like "Old Backups" or "Recent Photos"
            </p>
          </div>
          
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-gray-400" />
              <select
                value={selectedCategory || ''}
                onChange={(e) => {
                  setSelectedCategory(e.target.value || null);
                  setSelectedCell(null);
                }}
                className="border border-gray-300 rounded px-3 py-1 text-sm"
              >
                <option value="">All Categories</option>
                {categoryNames.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            
            <select
              value={selectedAgeBucket || ''}
              onChange={(e) => {
                setSelectedAgeBucket(e.target.value || null);
                setSelectedCell(null);
              }}
              className="border border-gray-300 rounded px-3 py-1 text-sm"
            >
              <option value="">All Ages</option>
              {AGE_BUCKETS.map(bucket => (
                <option key={bucket.label} value={bucket.label}>{bucket.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {/* Matrix View */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Age × Category Matrix</h3>
            
            {categoriesShown.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <p>Analytics not ready yet. Run a full scan and wait for analytics to compute.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold border-b border-gray-200">Category</th>
                      {AGE_BUCKETS.map(bucket => (
                        <th
                          key={bucket.label}
                          className={`px-4 py-3 text-center text-sm font-semibold border-b border-gray-200 ${
                            selectedAgeBucket === bucket.label ? 'bg-blue-50' : ''
                          }`}
                        >
                          {bucket.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {categoriesShown.map(categoryName => {
                      const category = getCategoryByName(categoryName);
                      
                      return (
                        <tr
                          key={categoryName}
                          className={selectedCategory === categoryName ? 'bg-blue-50' : 'hover:bg-gray-50'}
                        >
                          <td className="px-4 py-3 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                              <span>{category?.icon || '📁'}</span>
                              <span className="font-medium text-sm">{categoryName}</span>
                            </div>
                          </td>
                          {AGE_BUCKETS.map(ageBucket => {
                            const cell = matrixData.find(
                              c => c.category === categoryName && c.ageBucket === ageBucket.label
                            );
                            const isSelected = selectedCell?.category === categoryName && selectedCell?.ageBucket === ageBucket.label;
                            
                            return (
                              <td
                                key={ageBucket.label}
                                onClick={() => {
                                  if (cell && cell.folderCount > 0) {
                                    setSelectedCell(isSelected ? null : { category: categoryName, ageBucket: ageBucket.label });
                                  }
                                }}
                                className={`px-4 py-3 text-center border-b border-gray-100 cursor-pointer transition-all ${
                                  cell && cell.folderCount > 0
                                    ? 'hover:ring-2 hover:ring-blue-500'
                                    : ''
                                } ${isSelected ? 'ring-2 ring-blue-500 bg-blue-100' : ''}`}
                                style={{
                                  backgroundColor: cell ? getCellColor(cell) : '#f9fafb'
                                }}
                                title={
                                  cell
                                    ? `${cell.folderCount} folders, ${formatSize(cell.totalSize)}`
                                    : 'No folders'
                                }
                              >
                                {cell && cell.folderCount > 0 ? (
                                  <div>
                                    <div className="font-semibold text-sm">{cell.folderCount}</div>
                                    <div className="text-xs text-gray-600">{formatSize(cell.totalSize)}</div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          {/* Selected Cell Details */}
          {selectedCell && selectedFolders.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  Folders: {selectedCell.category} × {selectedCell.ageBucket}
                </h3>
                <button
                  onClick={() => setSelectedCell(null)}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Clear selection
                </button>
              </div>
              
              <div className="space-y-2">
                {selectedFolders.map((folder) => {
                  const pathString = formatFolderPath(folder);
                  const ageDays = folder.modifiedTime
                    ? Math.floor((Date.now() - new Date(folder.modifiedTime).getTime()) / (1000 * 60 * 60 * 24))
                    : null;
                  
                  return (
                    <div
                      key={folder.id}
                      onClick={() => onFileClick?.(folder)}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Folder size={20} className="text-blue-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm mb-1">{folder.name}</div>
                          <div className="text-xs text-gray-500 truncate" title={pathString}>
                            {pathString}
                            {ageDays !== null && ` • ${ageDays} days old`}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-gray-700 flex-shrink-0 ml-4">
                        {formatSize(folder.calculatedSize || folder.size || 0)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Insights */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Insights</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Old Backups */}
              {(() => {
                const oldBackups = matrixData.find(c => c.category === 'Backup/Archive' && c.ageBucket === '365+ days');
                if (oldBackups && oldBackups.folderCount > 0) {
                  return (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="font-semibold text-red-900 mb-1">Old Backups Detected</div>
                      <div className="text-sm text-red-700">
                        {oldBackups.folderCount} backup folders over 1 year old
                        ({formatSize(oldBackups.totalSize)}) - Consider archiving or deleting
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              
              {/* Recent Photos */}
              {(() => {
                const recentPhotos = matrixData.find(
                  c => c.category === 'Photos' && c.ageBucket === '0-30 days'
                );
                if (recentPhotos && recentPhotos.folderCount > 0) {
                  return (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="font-semibold text-green-900 mb-1">Recent Photo Activity</div>
                      <div className="text-sm text-green-700">
                        {recentPhotos.folderCount} photo folders modified in last 30 days
                        ({formatSize(recentPhotos.totalSize)})
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
