/** Search-First Interface - Search prominently displayed */
import { useState, useEffect, useMemo } from 'react';
import { Search, File, Folder, X } from 'lucide-react';
import { searchFiles, sortBySize, sortByDate, sortByName, formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

interface SearchFirstViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export const SearchFirstView = ({ files, childrenMap, onFileClick }: SearchFirstViewProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date'>('name');
  const [minSize, setMinSize] = useState<number | null>(null);
  
  // Debounce search query to avoid laggy typing
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
  // Memoize filtered and sorted results
  const results = useMemo(() => {
    let filtered = searchFiles(files, debouncedSearchQuery);
    
    // Apply size filter
    if (minSize !== null && minSize > 0) {
      filtered = filtered.filter(f => (f.calculatedSize || f.size || 0) >= minSize * 1024 * 1024);
    }
    
    // Apply sorting
    if (sortBy === 'size') {
      return sortBySize(filtered);
    } else if (sortBy === 'date') {
      return sortByDate(filtered);
    } else {
      return sortByName(filtered);
    }
  }, [files, debouncedSearchQuery, minSize, sortBy]);
  
  // Show folder path context
  const getFolderPath = (file: FileItem): string => {
    if (file.parents.length === 0) return 'Root';
    // For simplicity, just show parent count
    // Could enhance to show actual path
    return `Folder (${file.parents.length} level${file.parents.length > 1 ? 's' : ''} deep)`;
  };
  
  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search files and folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>
          
          {/* Filters */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <label className="text-gray-600">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'size' | 'date')}
                className="border border-gray-300 rounded px-2 py-1"
              >
                <option value="name">Name</option>
                <option value="size">Size</option>
                <option value="date">Date</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-gray-600">Min size (MB):</label>
              <input
                type="number"
                min="0"
                placeholder="Any"
                value={minSize || ''}
                onChange={(e) => setMinSize(e.target.value ? parseFloat(e.target.value) : null)}
                className="w-20 border border-gray-300 rounded px-2 py-1"
              />
            </div>
            
            <div className="text-gray-600">
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </div>
          </div>
        </div>
      </div>
      
      {/* Results */}
      <div className="flex-1 overflow-auto p-4">
        {searchQuery || minSize ? (
          results.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              No files match your search
            </div>
          ) : (
            <div className="space-y-2">
              {/* Limit results to prevent DOM overload */}
              {results.slice(0, 1000).map((item) => {
                const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                return (
                  <div
                    key={item.id}
                    onClick={() => onFileClick?.(item)}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    {isFolder ? (
                      <Folder size={24} className="text-blue-500 flex-shrink-0" />
                    ) : (
                      <File size={24} className="text-gray-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.name}</div>
                      <div className="text-sm text-gray-500">
                        {getFolderPath(item)} • {formatSize(item.calculatedSize || item.size)}
                        {item.modifiedTime && ` • Modified ${new Date(item.modifiedTime).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>
                );
              })}
              {results.length > 1000 && (
                <div className="text-center text-gray-500 py-4 border-t border-gray-200">
                  Showing first 1,000 of {results.length} results. Refine your search to see more.
                </div>
              )}
            </div>
          )
        ) : (
          <div className="text-center text-gray-500 mt-8">
            <Search size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">Start typing to search</p>
            <p className="text-sm">Search for files and folders by name</p>
          </div>
        )}
      </div>
    </div>
  );
};
