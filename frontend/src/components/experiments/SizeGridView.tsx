/** Size-Based Grid View - Larger items = bigger visual */
import { Folder, File } from 'lucide-react';
import { sortBySize, formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

interface SizeGridViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

const getTypeColor = (mimeType: string): string => {
  if (mimeType === 'application/vnd.google-apps.folder') return 'bg-blue-100 border-blue-300';
  if (mimeType.startsWith('image/')) return 'bg-green-100 border-green-300';
  if (mimeType.startsWith('video/')) return 'bg-red-100 border-red-300';
  if (mimeType.startsWith('audio/')) return 'bg-purple-100 border-purple-300';
  if (mimeType.includes('pdf') || mimeType.includes('document')) return 'bg-yellow-100 border-yellow-300';
  return 'bg-gray-100 border-gray-300';
};

const getSizeScale = (maxSize: number, currentSize: number): number => {
  if (maxSize === 0) return 0.1;
  // Scale between 0.3 and 1.0 (30% to 100% of max)
  return 0.3 + (currentSize / maxSize) * 0.7;
};

export const SizeGridView = ({ files, childrenMap, onFileClick }: SizeGridViewProps) => {
  // Get all items with sizes
  const itemsWithSizes = files
    .map(f => ({
      ...f,
      displaySize: f.calculatedSize || f.size || 0
    }))
    .filter(f => f.displaySize > 0);
  
  const sortedItems = sortBySize(itemsWithSizes);
  const maxSize = sortedItems[0]?.displaySize || 1;
  
  // Show top 100 largest items to avoid overwhelming
  const topItems = sortedItems.slice(0, 100);
  
  return (
    <div className="flex flex-col h-full p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Largest Files & Folders</h2>
        <p className="text-sm text-gray-600">Showing top 100 items, sized by storage usage</p>
      </div>
      
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {topItems.map((item) => {
            const scale = getSizeScale(maxSize, item.displaySize);
            const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
            const colorClass = getTypeColor(item.mimeType);
            
            return (
              <div
                key={item.id}
                onClick={() => onFileClick?.(item)}
                className={`${colorClass} border-2 rounded-lg p-4 cursor-pointer hover:opacity-80 transition-all flex flex-col items-center justify-center`}
                style={{
                  minHeight: `${120 * scale}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'center',
                }}
              >
                {isFolder ? (
                  <Folder size={Math.max(32, 48 * scale)} className="text-blue-600 mb-2" />
                ) : (
                  <File size={Math.max(32, 48 * scale)} className="text-gray-600 mb-2" />
                )}
                <div 
                  className="text-xs font-medium text-center truncate w-full"
                  title={item.name}
                  style={{ fontSize: `${10 + scale * 4}px` }}
                >
                  {item.name.length > 15 ? item.name.substring(0, 12) + '...' : item.name}
                </div>
                <div 
                  className="text-xs text-gray-600 mt-1"
                  style={{ fontSize: `${8 + scale * 2}px` }}
                >
                  {formatSize(item.displaySize)}
                </div>
              </div>
            );
          })}
        </div>
        
        {sortedItems.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            No files with size information available
          </div>
        )}
      </div>
    </div>
  );
};
