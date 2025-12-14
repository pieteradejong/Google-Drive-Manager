/** Shared Files Analysis - Files with multiple parents */
import { useMemo } from 'react';
import { Share2, Folder, File } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

interface SharedFilesAnalysisViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

export const SharedFilesAnalysisView = ({ files, childrenMap, onFileClick }: SharedFilesAnalysisViewProps) => {
  // Find files with multiple parents (shared files)
  const sharedFiles = useMemo(() => {
    return files.filter(f => f.parents.length > 1);
  }, [files]);
  
  // Group by number of parents
  const sharedByCount = useMemo(() => {
    const groups: Record<number, FileItem[]> = {};
    sharedFiles.forEach(file => {
      const count = file.parents.length;
      if (!groups[count]) groups[count] = [];
      groups[count].push(file);
    });
    return groups;
  }, [sharedFiles]);
  
  // Get folder names for a file
  const getParentFolders = (file: FileItem): string[] => {
    return file.parents
      .map(parentId => {
        const parent = files.find(f => f.id === parentId);
        return parent?.name || `Unknown (${parentId.substring(0, 8)}...)`;
      })
      .filter(Boolean);
  };
  
  const totalSharedSize = sharedFiles.reduce((sum, f) => sum + (f.calculatedSize || f.size || 0), 0);
  
  return (
    <div className="flex flex-col h-full overflow-auto p-6 bg-gray-50">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Header Stats */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Shared Files Analysis</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Share2 className="text-blue-600" size={20} />
                <span className="text-sm text-gray-600">Shared Files</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{sharedFiles.length.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">
                {((sharedFiles.length / files.length) * 100).toFixed(1)}% of all files
              </div>
            </div>
            
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <File className="text-green-600" size={20} />
                <span className="text-sm text-gray-600">Total Size</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{formatSize(totalSharedSize)}</div>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Share2 className="text-purple-600" size={20} />
                <span className="text-sm text-gray-600">Max Parents</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {Math.max(...sharedFiles.map(f => f.parents.length), 0)}
              </div>
            </div>
          </div>
        </div>
        
        {/* Shared by Count */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Files by Parent Count</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Object.entries(sharedByCount)
              .sort(([a], [b]) => parseInt(b) - parseInt(a))
              .map(([count, fileList]) => (
                <div key={count} className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900">{fileList.length}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {count} parent{count !== '1' ? 's' : ''}
                  </div>
                </div>
              ))}
          </div>
        </div>
        
        {/* Shared Files List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">All Shared Files</h3>
          {sharedFiles.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Size</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Parents</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sharedFiles.slice(0, 500).map((file) => {
                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                    const parentFolders = getParentFolders(file);
                    
                    return (
                      <tr
                        key={file.id}
                        onClick={() => onFileClick?.(file)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isFolder ? (
                              <Folder size={18} className="text-blue-500" />
                            ) : (
                              <File size={18} className="text-gray-400" />
                            )}
                            <span className="font-medium text-gray-900">{file.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatSize(file.calculatedSize || file.size)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {parentFolders.slice(0, 3).map((parent, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded"
                              >
                                {parent}
                              </span>
                            ))}
                            {parentFolders.length > 3 && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                                +{parentFolders.length - 3} more
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {isFolder ? 'Folder' : file.mimeType.split('/').pop()?.toUpperCase() || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">No shared files found</div>
          )}
          {sharedFiles.length > 500 && (
            <div className="text-center text-gray-500 mt-4 text-sm">
              Showing first 500 of {sharedFiles.length} shared files
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
