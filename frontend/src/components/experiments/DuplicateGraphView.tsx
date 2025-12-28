/** 
 * DuplicateGraphView - Visualize duplicate file locations in the folder hierarchy
 * Shows a mini tree/graph of folders containing duplicates with highlighting
 */
import { useMemo, useState } from 'react';
import { Folder, File as FileIcon, Copy, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import type { FileItem, DuplicateGroup } from '../../types/drive';

interface DuplicateGraphViewProps {
  group: DuplicateGroup;
  files: Map<string, FileItem & { path?: string; parentFolderId?: string }>;
  allFiles?: FileItem[];
  childrenMap?: Record<string, string[]>;
  onNavigateToFolder?: (folderId: string) => void;
  onFileClick?: (file: FileItem) => void;
}

interface FolderNode {
  id: string;
  name: string;
  path: string;
  duplicateFiles: Array<FileItem & { path?: string }>;
  children: FolderNode[];
  depth: number;
}

export const DuplicateGraphView = ({
  group,
  files,
  allFiles = [],
  childrenMap = {},
  onNavigateToFolder,
  onFileClick,
}: DuplicateGraphViewProps) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Build folder map from allFiles for path resolution
  const folderById = useMemo(() => {
    const map = new Map<string, FileItem>();
    allFiles.forEach(f => {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        map.set(f.id, f);
      }
    });
    return map;
  }, [allFiles]);

  // Group duplicate files by their parent folder
  const folderGroups = useMemo(() => {
    const groups = new Map<string, Array<FileItem & { path?: string }>>();
    
    (group.file_ids || []).forEach(fileId => {
      const file = files.get(fileId);
      if (!file) return;
      
      const parentId = file.parentFolderId || file.parents?.[0] || 'root';
      if (!groups.has(parentId)) {
        groups.set(parentId, []);
      }
      groups.get(parentId)!.push(file);
    });
    
    return groups;
  }, [group.file_ids, files]);

  // Build folder info for display
  const folderInfos = useMemo(() => {
    const infos: Array<{
      folderId: string;
      folderName: string;
      path: string;
      duplicateFiles: Array<FileItem & { path?: string }>;
    }> = [];
    
    folderGroups.forEach((duplicateFiles, folderId) => {
      const folder = folderById.get(folderId);
      const firstFile = duplicateFiles[0];
      const path = firstFile?.path || 'Root';
      
      infos.push({
        folderId,
        folderName: folder?.name || (folderId === 'root' ? 'Root' : 'Unknown Folder'),
        path,
        duplicateFiles,
      });
    });
    
    // Sort by path for consistent display
    infos.sort((a, b) => a.path.localeCompare(b.path));
    
    return infos;
  }, [folderGroups, folderById]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const isVerified = group.confidence === 'verified';

  return (
    <div className="bg-gray-50 rounded-lg p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Copy size={16} className="text-blue-500" />
        <span className="text-sm font-medium text-gray-700">
          Duplicate locations in hierarchy
        </span>
        <span className="text-xs text-gray-500">
          ({folderInfos.length} folder{folderInfos.length !== 1 ? 's' : ''})
        </span>
      </div>

      <div className="space-y-2">
        {folderInfos.map(({ folderId, folderName, path, duplicateFiles }) => {
          const isExpanded = expandedFolders.has(folderId);
          
          return (
            <div 
              key={folderId} 
              className={`bg-white rounded border ${
                isVerified ? 'border-green-200' : 'border-amber-200'
              }`}
            >
              {/* Folder header */}
              <div 
                className="flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleFolder(folderId)}
              >
                <button className="p-0.5 text-gray-400 hover:text-gray-600">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <Folder size={16} className="text-blue-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{folderName}</div>
                  <div className="text-xs text-gray-500 truncate" title={path}>{path}</div>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  isVerified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {duplicateFiles.length} file{duplicateFiles.length !== 1 ? 's' : ''}
                </span>
                {onNavigateToFolder && folderId !== 'root' && (
                  <button
                    className="text-blue-600 hover:text-blue-800 p-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToFolder(folderId);
                    }}
                    title="Navigate to folder in DAG view"
                  >
                    <ExternalLink size={14} />
                  </button>
                )}
              </div>
              
              {/* Expanded file list */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-2 py-1 space-y-1">
                  {duplicateFiles.map((file, idx) => (
                    <div 
                      key={file.id}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer"
                      onClick={() => onFileClick?.(file)}
                    >
                      <FileIcon size={14} className="text-gray-400" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{file.name}</div>
                        <div className="text-[10px] text-gray-500">
                          {formatSize(file.size || 0)}
                          {file.modifiedTime && (
                            <span className="ml-2">
                              Modified: {new Date(file.modifiedTime).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {idx === 0 && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          Keep
                        </span>
                      )}
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                        >
                          Open
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Visual tree representation */}
      {folderInfos.length > 1 && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-2">Path comparison:</div>
          <div className="font-mono text-xs space-y-1">
            {folderInfos.map(({ folderId, path, duplicateFiles }) => (
              <div key={folderId} className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded ${
                  isVerified ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {duplicateFiles.length}
                </span>
                <span className="text-gray-600 truncate" title={path}>
                  {path}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DuplicateGraphView;
