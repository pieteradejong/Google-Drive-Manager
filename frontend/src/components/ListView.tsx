/** List/tree view component */
import { useState } from 'react';
import { Folder, File, ChevronRight, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import type { FileItem } from '../types/drive';

interface ListViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

const formatSize = (bytes: number | undefined): string => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

const FileRow = ({
  file,
  level = 0,
  childrenMap,
  allFiles,
  onFileClick,
  expandedFolders,
  toggleFolder,
}: {
  file: FileItem;
  level: number;
  childrenMap: Record<string, string[]>;
  allFiles: FileItem[];
  onFileClick?: (file: FileItem) => void;
  expandedFolders: Set<string>;
  toggleFolder: (id: string) => void;
}) => {
  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
  const children = childrenMap[file.id] || [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedFolders.has(file.id);

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer border-b border-gray-200"
        onClick={() => {
          if (isFolder && hasChildren) {
            toggleFolder(file.id);
          } else if (onFileClick) {
            onFileClick(file);
          }
        }}
      >
        <td className="px-4 py-2" style={{ paddingLeft: `${level * 24 + 16}px` }}>
          <div className="flex items-center gap-2">
            {isFolder && hasChildren && (
              <span className="text-gray-400">
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            )}
            {!isFolder && hasChildren && <span className="w-4" />}
            {isFolder ? (
              <Folder size={18} className="text-blue-500" />
            ) : (
              <File size={18} className="text-gray-400" />
            )}
            <span className="font-medium">{file.name}</span>
          </div>
        </td>
        <td className="px-4 py-2 text-sm text-gray-600">
          {formatSize(file.calculatedSize || file.size)}
        </td>
        <td className="px-4 py-2 text-sm text-gray-500">
          {file.modifiedTime
            ? format(new Date(file.modifiedTime), 'MMM dd, yyyy')
            : '-'}
        </td>
        <td className="px-4 py-2 text-sm text-gray-500">
          {file.mimeType.split('/').pop()?.toUpperCase() || '-'}
        </td>
      </tr>
      {isFolder && hasChildren && isExpanded && (
        <>
          {children.map((childId) => {
            const child = allFiles.find((f) => f.id === childId);
            if (!child) return null;
            return (
              <FileRow
                key={childId}
                file={child}
                level={level + 1}
                childrenMap={childrenMap}
                allFiles={allFiles}
                onFileClick={onFileClick}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
              />
            );
          })}
        </>
      )}
    </>
  );
};

export const ListView = ({ files, childrenMap, onFileClick }: ListViewProps) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const rootFiles = files.filter((f) => f.parents.length === 0);

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No files to display
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto">
      <table className="w-full border-collapse">
        <thead className="bg-gray-100 sticky top-0">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Size</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
              Modified
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
          </tr>
        </thead>
        <tbody>
          {rootFiles.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              level={0}
              childrenMap={childrenMap}
              allFiles={files}
              onFileClick={onFileClick}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};






