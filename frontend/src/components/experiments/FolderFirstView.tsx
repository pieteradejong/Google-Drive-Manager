/** Folder-First Navigation View - Like Finder/Explorer */
import { Folder, File, ArrowLeft, Home } from 'lucide-react';
import { useVisualizationStore } from '../../stores/visualizationStore';
import { getCurrentFolderContents, getFolderPath, getParentFolder, formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

interface FolderFirstViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

export const FolderFirstView = ({ files, childrenMap, onFileClick }: FolderFirstViewProps) => {
  const { currentFolderId, setCurrentFolderId, pushToHistory, popFromHistory } = useVisualizationStore();
  
  const currentContents = getCurrentFolderContents(currentFolderId, files, childrenMap);
  const folderPath = getFolderPath(currentFolderId, files);
  const parentId = getParentFolder(currentFolderId, files);
  
  const handleFolderClick = (folder: FileItem) => {
    pushToHistory(folder.id);
    setCurrentFolderId(folder.id);
  };
  
  const handleBackClick = () => {
    const prevId = popFromHistory();
    setCurrentFolderId(prevId);
  };
  
  const handleHomeClick = () => {
    setCurrentFolderId(null);
    // Clear history when going to root
    useVisualizationStore.setState({ navigationHistory: [] });
  };
  
  // Separate folders and files
  const folders = currentContents.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const fileItems = currentContents.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  
  // Sort: folders first, then by name
  const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name));
  const sortedFiles = [...fileItems].sort((a, b) => a.name.localeCompare(b.name));
  
  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb Navigation */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2">
        <button
          onClick={handleHomeClick}
          className="p-1 hover:bg-gray-100 rounded"
          title="Home"
        >
          <Home size={18} />
        </button>
        {currentFolderId !== null && (
          <button
            onClick={handleBackClick}
            className="p-1 hover:bg-gray-100 rounded"
            title="Back"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="flex items-center gap-1 text-sm text-gray-600">
          <span>Home</span>
          {folderPath.map((folder, idx) => (
            <span key={folder.id}>
              <span className="mx-1">/</span>
              <button
                onClick={() => {
                  // Navigate to this folder level
                  const targetPath = folderPath.slice(0, idx + 1);
                  useVisualizationStore.setState({ 
                    currentFolderId: folder.id,
                    navigationHistory: targetPath.map(f => f.id)
                  });
                }}
                className="hover:text-blue-600"
              >
                {folder.name}
              </button>
            </span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {/* Folders */}
            {sortedFolders.map((folder) => (
              <div
                key={folder.id}
                onClick={() => handleFolderClick(folder)}
                className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors"
              >
                <Folder size={48} className="text-blue-500 mb-2" />
                <div className="text-sm font-medium text-center truncate w-full" title={folder.name}>
                  {folder.name}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {formatSize(folder.calculatedSize || folder.size)}
                </div>
              </div>
            ))}
            
            {/* Files */}
            {sortedFiles.map((file) => (
              <div
                key={file.id}
                onClick={() => onFileClick?.(file)}
                className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <File size={48} className="text-gray-400 mb-2" />
                <div className="text-sm font-medium text-center truncate w-full" title={file.name}>
                  {file.name}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {formatSize(file.size)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
