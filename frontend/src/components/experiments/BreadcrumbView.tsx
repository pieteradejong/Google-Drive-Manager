/** Breadcrumb Drill-Down View */
import { Folder, File, Home, ChevronRight } from 'lucide-react';
import { getCurrentFolderContents, getFolderPath, formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

interface BreadcrumbViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
  currentFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
}

export const BreadcrumbView = ({ 
  files, 
  childrenMap, 
  onFileClick,
  currentFolderId,
  onFolderSelect 
}: BreadcrumbViewProps) => {
  const currentContents = getCurrentFolderContents(currentFolderId, files, childrenMap);
  const folderPath = getFolderPath(currentFolderId, files);
  
  const folders = currentContents.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const fileItems = currentContents.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  
  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb Navigation */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onFolderSelect(null)}
            className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-gray-100 rounded"
          >
            <Home size={16} />
            <span>Home</span>
          </button>
          {folderPath.map((folder, idx) => (
            <div key={folder.id} className="flex items-center gap-2">
              <span className="text-gray-400">/</span>
              <button
                onClick={() => {
                  // Navigate to this folder level
                  onFolderSelect(folder.id);
                }}
                className="px-2 py-1 text-sm hover:bg-gray-100 rounded font-medium"
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>
      </div>
      
      {/* Folder Contents */}
      <div className="flex-1 overflow-auto p-4">
        {currentContents.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            This folder is empty
          </div>
        ) : (
          <div className="space-y-2">
            {/* Folders */}
            {folders.map((folder) => (
              <div
                key={folder.id}
                onClick={() => onFolderSelect(folder.id)}
                className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors"
              >
                <Folder size={32} className="text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{folder.name}</div>
                  <div className="text-sm text-gray-500">
                    {formatSize(folder.calculatedSize || folder.size)}
                  </div>
                </div>
                <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
              </div>
            ))}
            
            {/* Files */}
            {fileItems.map((file) => (
              <div
                key={file.id}
                onClick={() => onFileClick?.(file)}
                className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <File size={32} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{file.name}</div>
                  <div className="text-sm text-gray-500">
                    {formatSize(file.size)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
