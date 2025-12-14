/** Shared Files Analysis - Find files with multiple parents */
import { useMemo } from 'react';
import { Share2, File, Folder, Link } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

interface SharedFilesViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

export const SharedFilesView = ({ files, childrenMap, onFileClick }: SharedFilesViewProps) => {
  // Find files with multiple parents (shared files)
  const sharedFiles = useMemo(() => {
    return files.filter(file => file.parents.length > 1);
  }, [files]);
  
  // Group by number of parents
  const sharedByCount = useMemo(() => {
    const groups: Record<number, FileItem[]> = {};
    
    sharedFiles.forEach(file => {
      const count = file.parents.length;
      if (!groups[count]) {
        groups[count] = [];
      }
      groups[count].push(file);
    });
    
    return groups;
  }, [sharedFiles]);
  
  // Get folder path for a file
  const getFolderPath = (file: FileItem): string => {
    if (file.parents.length === 0) return 'Root';
    return `${file.parents.length} location${file.parents.length > 1 ? 's' : ''}`;
  };
  
  // Get parent folder names (limited)
  const getParentNames = (file: FileItem, limit: number = 3): string[] => {
    const parentNames: string[] = [];
    file.parents.slice(0, limit).forEach(parentId => {
      const parent = files.find(f => f.id === parentId);
      if (parent) {
        parentNames.push(parent.name);
      }
    });
    if (file.parents.length > limit) {
      parentNames.push(`+${file.parents.length - limit} more`);
    }
    return parentNames;
  };
  
  return (
    <div className="flex flex-col h-full overflow-auto p-6 bg-gray-50">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Header Stats */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <Share2 size={24} className="text-blue-500" />
            <div>
              <h2 className="text-2xl font-semibold">Shared Files Analysis</h2>
              <p className="text-gray-600 text-sm mt-1">
                Files that appear in multiple folders (shared files)
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Total Shared Files</div>
              <div className="text-2xl font-bold">{sharedFiles.length}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Total Locations</div>
              <div className="text-2xl font-bold">
                {sharedFiles.reduce((sum, f) => sum + f.parents.length, 0)}
              </div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Avg Locations per File</div>
              <div className="text-2xl font-bold">
                {sharedFiles.length > 0
                  ? (sharedFiles.reduce((sum, f) => sum + f.parents.length, 0) / sharedFiles.length).toFixed(1)
                  : '0'}
              </div>
            </div>
          </div>
        </div>
        
        {/* Shared Files by Count */}
        {Object.keys(sharedByCount).length > 0 ? (
          Object.entries(sharedByCount)
            .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
            .map(([count, files]) => (
              <div key={count} className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Link size={20} />
                  Files in {count} Location{parseInt(count) > 1 ? 's' : ''} ({files.length} files)
                </h3>
                <div className="space-y-2">
                  {files.map((file) => {
                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                    const parentNames = getParentNames(file);
                    
                    return (
                      <div
                        key={file.id}
                        onClick={() => onFileClick?.(file)}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {isFolder ? (
                            <Folder size={20} className="text-blue-500 flex-shrink-0" />
                          ) : (
                            <File size={20} className="text-gray-400 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{file.name}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                              <Share2 size={12} />
                              <span>In: {parentNames.join(', ')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-gray-700 flex-shrink-0">
                          {formatSize(file.calculatedSize || file.size || 0)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Share2 size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium text-gray-700 mb-2">No Shared Files Found</p>
            <p className="text-sm text-gray-500">
              Files that appear in multiple folders will be shown here
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
