/** Sidebar Tree + Main Content View - Like VS Code */
import { useState, useMemo } from 'react';
import { Folder, ChevronRight, ChevronDown, File } from 'lucide-react';
import { buildFolderTree, getCurrentFolderContents, formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';
import type { FolderTreeNode } from '../../utils/navigation';

interface SidebarTreeViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

const FolderTreeNode = ({
  node,
  selectedId,
  onSelect,
  expandedFolders,
  toggleFolder,
  level = 0,
}: {
  node: FolderTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (id: string) => void;
  level?: number;
}) => {
  const isExpanded = expandedFolders.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  
  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-100 ${
          isSelected ? 'bg-blue-100' : ''
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) {
            toggleFolder(node.id);
          }
          onSelect(node.id);
        }}
      >
        {hasChildren ? (
          <span className="text-gray-400">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : (
          <span className="w-[14px]" />
        )}
        <Folder size={16} className="text-blue-500" />
        <span className="text-sm truncate flex-1">{node.name}</span>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <FolderTreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const SidebarTreeView = ({ files, childrenMap, onFileClick }: SidebarTreeViewProps) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  // Memoize expensive computations
  const folderTree = useMemo(() => buildFolderTree(files, childrenMap), [files, childrenMap]);
  const selectedContents = useMemo(
    () => getCurrentFolderContents(selectedFolderId, files, childrenMap),
    [selectedFolderId, files, childrenMap]
  );
  
  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };
  
  // Separate folders and files
  const folders = selectedContents.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const fileItems = selectedContents.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-200 bg-gray-50 overflow-auto">
        <div className="p-2 font-semibold text-sm text-gray-700 border-b border-gray-200">
          Folders
        </div>
        <div className="p-1">
          {folderTree.map((node) => (
            <FolderTreeNode
              key={node.id}
              node={node}
              selectedId={selectedFolderId}
              onSelect={setSelectedFolderId}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
            />
          ))}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        {selectedFolderId === null ? (
          <div className="text-center text-gray-500 mt-8">
            Select a folder from the sidebar to view its contents
          </div>
        ) : selectedContents.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            This folder is empty
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold mb-4">
              {files.find(f => f.id === selectedFolderId)?.name || 'Folder'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Folders */}
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-blue-50 cursor-pointer"
                >
                  <Folder size={24} className="text-blue-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{folder.name}</div>
                    <div className="text-xs text-gray-500">{formatSize(folder.calculatedSize || folder.size)}</div>
                  </div>
                </div>
              ))}
              
              {/* Files */}
              {fileItems.map((file) => (
                <div
                  key={file.id}
                  onClick={() => onFileClick?.(file)}
                  className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <File size={24} className="text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                    <div className="text-xs text-gray-500">{formatSize(file.size)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
