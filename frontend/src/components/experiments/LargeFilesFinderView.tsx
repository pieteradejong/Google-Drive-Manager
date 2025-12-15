/** Large Files/Folders Finder - Sortable table to find space hogs */
import { useState, useMemo, useEffect } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { sortBySize, sortByDate, sortByName, formatSize } from '../../utils/navigation';
import { measureSync } from '../../utils/performance';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface LargeFilesFinderViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

type SortField = 'name' | 'size' | 'type' | 'modified';
type SortDirection = 'asc' | 'desc';

export const LargeFilesFinderView = ({ files, childrenMap, onFileClick }: LargeFilesFinderViewProps) => {
  const [sortField, setSortField] = useState<SortField>('size');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [minSizeMB, setMinSizeMB] = useState<number>(0);
  const [showFolders, setShowFolders] = useState(true);
  const [showFiles, setShowFiles] = useState(true);
  const [isProcessing, setIsProcessing] = useState(true);
  const [processProgress, setProcessProgress] = useState(0);
  
  // Filter and sort items
  const filteredAndSorted = useMemo(() => {
    setIsProcessing(true);
    setProcessProgress(0);
    
    const result = measureSync('LargeFilesFinderView: filterAndSort', () => {
    let filtered = files.filter(f => {
      const size = f.calculatedSize || f.size || 0;
      const sizeMB = size / (1024 * 1024);
      
      // Size filter
      if (sizeMB < minSizeMB) return false;
      
      // Type filter
      const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
      if (isFolder && !showFolders) return false;
      if (!isFolder && !showFiles) return false;
      
      return true;
    });
    
    // Sort
    if (sortField === 'size') {
      filtered = sortBySize(filtered);
      if (sortDirection === 'asc') filtered = filtered.reverse();
    } else if (sortField === 'name') {
      filtered = sortByName(filtered);
      if (sortDirection === 'desc') filtered = filtered.reverse();
    } else if (sortField === 'modified') {
      filtered = sortByDate(filtered);
      if (sortDirection === 'asc') filtered = filtered.reverse();
    } else if (sortField === 'type') {
      filtered = filtered.sort((a, b) => {
        const typeA = a.mimeType.split('/').pop() || '';
        const typeB = b.mimeType.split('/').pop() || '';
        const result = typeA.localeCompare(typeB);
        return sortDirection === 'asc' ? result : -result;
      });
    }
    
    return filtered.slice(0, 1000); // Limit to 1000 items
    }, 500);
    
    setProcessProgress(100);
    setTimeout(() => {
      setIsProcessing(false);
    }, 200);
    
    return result;
  }, [files, minSizeMB, showFolders, showFiles, sortField, sortDirection]);
  
  // Show loading state during processing
  if (isProcessing) {
    return (
      <LoadingState
        operation="Filtering and sorting files"
        details={`Processing ${files.length.toLocaleString()} files...`}
        progress={processProgress}
      />
    );
  }
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };
  
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="text-gray-400" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp size={14} className="text-blue-600" />
    ) : (
      <ArrowDown size={14} className="text-blue-600" />
    );
  };
  
  const totalFilteredSize = filteredAndSorted.reduce((sum, f) => sum + (f.calculatedSize || f.size || 0), 0);
  
  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Min Size (MB):</label>
            <input
              type="number"
              min="0"
              step="1"
              value={minSizeMB}
              onChange={(e) => setMinSizeMB(parseFloat(e.target.value) || 0)}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showFolders}
                onChange={(e) => setShowFolders(e.target.checked)}
                className="rounded"
              />
              Folders
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showFiles}
                onChange={(e) => setShowFiles(e.target.checked)}
                className="rounded"
              />
              Files
            </label>
          </div>
          
          <div className="ml-auto text-sm text-gray-600">
            Showing {filteredAndSorted.length.toLocaleString()} items • {formatSize(totalFilteredSize)} total
          </div>
        </div>
      </div>
      
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th
                className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-2">
                  Name
                  <SortIcon field="name" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('size')}
              >
                <div className="flex items-center gap-2">
                  Size
                  <SortIcon field="size" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('type')}
              >
                <div className="flex items-center gap-2">
                  Type
                  <SortIcon field="type" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('modified')}
              >
                <div className="flex items-center gap-2">
                  Modified
                  <SortIcon field="modified" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No items match your filters
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((item) => {
                const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                const size = item.calculatedSize || item.size || 0;
                const sizeMB = size / (1024 * 1024);
                
                return (
                  <tr
                    key={item.id}
                    onClick={() => onFileClick?.(item)}
                    className="hover:bg-blue-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isFolder ? (
                          <span className="text-blue-500 font-medium">📁</span>
                        ) : (
                          <span className="text-gray-400">📄</span>
                        )}
                        <span className="font-medium text-gray-900">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <span>{formatSize(size)}</span>
                        {sizeMB > 100 && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                            Large
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {isFolder ? 'Folder' : item.mimeType.split('/').pop()?.toUpperCase() || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {item.modifiedTime
                        ? new Date(item.modifiedTime).toLocaleDateString()
                        : '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
