/** Card-Based Folder View - Each folder as a card */
import { Folder, File } from 'lucide-react';
import { getCurrentFolderContents, formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

interface CardFolderViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
  currentFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
}

export const CardFolderView = ({ 
  files, 
  childrenMap, 
  onFileClick,
  currentFolderId,
  onFolderSelect 
}: CardFolderViewProps) => {
  const currentContents = getCurrentFolderContents(currentFolderId, files, childrenMap);
  const folders = currentContents.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const fileItems = currentContents.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  
  // Get child counts for folders
  const getChildCount = (folderId: string): number => {
    return childrenMap[folderId]?.length || 0;
  };
  
  // Sort folders by size (largest first)
  const sortedFolders = [...folders].sort((a, b) => {
    const sizeA = a.calculatedSize || a.size || 0;
    const sizeB = b.calculatedSize || b.size || 0;
    return sizeB - sizeA;
  });
  
  return (
    <div className="flex flex-col h-full p-4">
      {currentFolderId !== null && (
        <button
          onClick={() => onFolderSelect(null)}
          className="mb-4 text-sm text-blue-600 hover:text-blue-800"
        >
          ← Back to Home
        </button>
      )}
      
      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          {currentFolderId === null ? 'Top-Level Folders' : files.find(f => f.id === currentFolderId)?.name || 'Folder'}
        </h2>
        <p className="text-sm text-gray-600">
          {folders.length} {folders.length === 1 ? 'folder' : 'folders'}
          {fileItems.length > 0 && ` • ${fileItems.length} ${fileItems.length === 1 ? 'file' : 'files'}`}
        </p>
      </div>
      
      <div className="flex-1 overflow-auto">
        {folders.length === 0 && fileItems.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            This folder is empty
          </div>
        ) : (
          <>
            {/* Folder Cards */}
            {sortedFolders.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Folders</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {sortedFolders.map((folder) => {
                    const childCount = getChildCount(folder.id);
                    const size = folder.calculatedSize || folder.size || 0;
                    
                    return (
                      <div
                        key={folder.id}
                        onClick={() => onFolderSelect(folder.id)}
                        className="bg-white border-2 border-blue-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-center mb-3">
                          <Folder size={48} className="text-blue-500" />
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-sm mb-2 truncate" title={folder.name}>
                            {folder.name}
                          </div>
                          <div className="text-xs text-gray-600 space-y-1">
                            <div>{childCount} {childCount === 1 ? 'item' : 'items'}</div>
                            <div className="font-medium">{formatSize(size)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* File List */}
            {fileItems.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Files</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {fileItems.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => onFileClick?.(file)}
                      className="bg-white border border-gray-200 rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <File size={20} className="text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{file.name}</div>
                          <div className="text-xs text-gray-500">{formatSize(file.size)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
