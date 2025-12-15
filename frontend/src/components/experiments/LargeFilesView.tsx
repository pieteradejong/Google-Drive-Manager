/** Large Files/Folders Finder - Sortable table with filters */
import { useState, useMemo, useEffect } from 'react';
import { File, Folder, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { sortBySize, sortByDate, sortByName, formatSize } from '../../utils/navigation';
import { measureSync } from '../../utils/performance';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface LargeFilesViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

type SortField = 'name' | 'size' | 'date' | 'type';
type SortDirection = 'asc' | 'desc';

export const LargeFilesView = ({ files, childrenMap, onFileClick }: LargeFilesViewProps) => {
  const [minSizeMB, setMinSizeMB] = useState<number>(0);
  const [sortField, setSortField] = useState<SortField>('size');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');
  const [isProcessing, setIsProcessing] = useState(true);
  const [processProgress, setProcessProgress] = useState(0);
  
  // Filter and sort files
  const filteredAndSorted = useMemo(() => {
    setIsProcessing(true);
    setProcessProgress(0);
    
    const result = measureSync('LargeFilesView: filterAndSort', () => {
    let filtered = files.filter(f => {
      const size = f.calculatedSize || f.size || 0;
      const sizeMB = size / (1024 * 1024);
      
      // Size filter
      if (sizeMB < minSizeMB) return false;
      
      // Type filter
      if (fileTypeFilter !== 'all') {
        if (fileTypeFilter === 'folders' && f.mimeType !== 'application/vnd.google-apps.folder') return false;
        if (fileTypeFilter === 'files' && f.mimeType === 'application/vnd.google-apps.folder') return false;
        if (fileTypeFilter === 'images' && !f.mimeType.startsWith('image/')) return false;
        if (fileTypeFilter === 'videos' && !f.mimeType.startsWith('video/')) return false;
        if (fileTypeFilter === 'documents' && !f.mimeType.includes('document') && !f.mimeType.includes('pdf')) return false;
      }
      
      return true;
    });
    
    // Sort
    let sorted: FileItem[];
    if (sortField === 'size') {
      sorted = sortBySize(filtered);
    } else if (sortField === 'date') {
      sorted = sortByDate(filtered);
    } else {
      sorted = sortByName(filtered);
    }
    
    // Reverse if ascending
    if (sortDirection === 'asc' && sortField !== 'name') {
      sorted = sorted.reverse();
    }
    
    // Limit to top 1000 to prevent DOM overload
    return sorted.slice(0, 1000);
    }, 500);
    
    setProcessProgress(100);
    setTimeout(() => {
      setIsProcessing(false);
    }, 200);
    
    return result;
  }, [files, minSizeMB, sortField, sortDirection, fileTypeFilter]);
  
  // Show loading state during processing
  if (isProcessing) {
    return (
      <LoadingState
        operation="Filtering and sorting large files"
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
    return sortDirection === 'asc' 
      ? <ArrowUp size={14} className="text-blue-600" />
      : <ArrowDown size={14} className="text-blue-600" />;
  };
  
  const getFileTypeCategory = (mimeType: string): string => {
    if (mimeType === 'application/vnd.google-apps.folder') return 'Folder';
    if (mimeType.startsWith('image/')) return 'Image';
    if (mimeType.startsWith('video/')) return 'Video';
    if (mimeType.startsWith('audio/')) return 'Audio';
    if (mimeType.includes('pdf') || mimeType.includes('document')) return 'Document';
    return 'Other';
  };
  
  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Min Size (MB):</label>
            <input
              type="number"
              min="0"
              step="1"
              value={minSizeMB}
              onChange={(e) => setMinSizeMB(parseFloat(e.target.value) || 0)}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Type:</label>
            <select
              value={fileTypeFilter}
              onChange={(e) => setFileTypeFilter(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="all">All</option>
              <option value="folders">Folders Only</option>
              <option value="files">Files Only</option>
              <option value="images">Images</option>
              <option value="videos">Videos</option>
              <option value="documents">Documents</option>
            </select>
          </div>
          
          <div className="text-sm text-gray-600">
            Showing {filteredAndSorted.length} of {files.length} items
            {minSizeMB > 0 && ` (filtered by size ≥ ${minSizeMB}MB)`}
          </div>
        </div>
      </div>
      
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                <button
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-1 hover:text-blue-600"
                >
                  Name
                  <SortIcon field="name" />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                <button
                  onClick={() => handleSort('size')}
                  className="flex items-center gap-1 hover:text-blue-600"
                >
                  Size
                  <SortIcon field="size" />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                <button
                  onClick={() => handleSort('type')}
                  className="flex items-center gap-1 hover:text-blue-600"
                >
                  Type
                  <SortIcon field="type" />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                <button
                  onClick={() => handleSort('date')}
                  className="flex items-center gap-1 hover:text-blue-600"
                >
                  Modified
                  <SortIcon field="date" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((item) => {
              const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
              const size = item.calculatedSize || item.size || 0;
              const modifiedDate = item.modifiedTime 
                ? new Date(item.modifiedTime).toLocaleDateString()
                : '-';
              
              return (
                <tr
                  key={item.id}
                  onClick={() => onFileClick?.(item)}
                  className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isFolder ? (
                        <Folder size={18} className="text-blue-500" />
                      ) : (
                        <File size={18} className="text-gray-400" />
                      )}
                      <span className="font-medium">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold">
                    {formatSize(size)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {getFileTypeCategory(item.mimeType)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {modifiedDate}
                  </td>
                </tr>
              );
            })}
            {filteredAndSorted.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No files match your filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filteredAndSorted.length >= 1000 && (
          <div className="px-4 py-2 text-sm text-gray-500 text-center bg-gray-50">
            Showing first 1,000 results. Refine filters to see more.
          </div>
        )}
      </div>
    </div>
  );
};
