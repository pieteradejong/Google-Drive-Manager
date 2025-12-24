/** Folder Depth Analysis - Understand folder structure complexity */
import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Layers, Folder } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import { measureSync } from '../../utils/performance';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface FolderDepthAnalysisViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

export const FolderDepthAnalysisView = ({ files, childrenMap: _childrenMap, onFileClick }: FolderDepthAnalysisViewProps) => {
  const [isCalculating, setIsCalculating] = useState(true);
  const [calcProgress, setCalcProgress] = useState(0);
  
  // Calculate depth for each folder
  const folderDepths = useMemo(() => {
    setIsCalculating(true);
    setCalcProgress(0);
    
    const result = measureSync('FolderDepthAnalysisView: calculateDepths', () => {
    const depthMap = new Map<string, number>();
    const visited = new Set<string>();
    
    const calculateDepth = (folderId: string, currentDepth: number = 0, path: Set<string> = new Set()): number => {
      // Prevent cycles
      if (path.has(folderId)) return currentDepth;
      if (visited.has(folderId)) return depthMap.get(folderId) || currentDepth;
      
      visited.add(folderId);
      const newPath = new Set(path);
      newPath.add(folderId);
      
      const folder = files.find(f => f.id === folderId);
      if (!folder || folder.mimeType !== 'application/vnd.google-apps.folder') {
        return currentDepth;
      }
      
      // Get parent depth
      let maxParentDepth = 0;
      if (folder.parents.length > 0) {
        for (const parentId of folder.parents) {
          const parentDepth = calculateDepth(parentId, currentDepth - 1, newPath);
          maxParentDepth = Math.max(maxParentDepth, parentDepth);
        }
      }
      
      const depth = maxParentDepth + 1;
      depthMap.set(folderId, depth);
      return depth;
    };
    
    // Calculate depth for all folders
    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    folders.forEach(folder => {
      if (folder.parents.length === 0) {
        // Root folder
        depthMap.set(folder.id, 0);
      } else {
        calculateDepth(folder.id);
      }
    });
    
    return depthMap;
    }, 500);
    
    setCalcProgress(100);
    setTimeout(() => {
      setIsCalculating(false);
    }, 200);
    
    return result;
  }, [files]);
  
  // Group folders by depth (must be before early return to follow Rules of Hooks)
  const depthGroups = useMemo(() => {
    if (!folderDepths) return {};
    const groups: Record<number, { folders: FileItem[]; totalSize: number }> = {};
    
    files.forEach(file => {
      if (file.mimeType !== 'application/vnd.google-apps.folder') return;
      
      const depth = folderDepths.get(file.id) ?? 0;
      if (!groups[depth]) {
        groups[depth] = { folders: [], totalSize: 0 };
      }
      groups[depth].folders.push(file);
      groups[depth].totalSize += file.calculatedSize || file.size || 0;
    });
    
    return groups;
  }, [files, folderDepths]);
  
  // Deepest paths (must be before early return to follow Rules of Hooks)
  const deepestFolders = useMemo(() => {
    if (!folderDepths) return [];
    return Array.from(folderDepths.entries())
      .map(([id, depth]) => ({
        id,
        depth,
        folder: files.find(f => f.id === id),
      }))
      .filter(item => item.folder)
      .sort((a, b) => b.depth - a.depth)
      .slice(0, 20);
  }, [folderDepths, files]);
  
  // Show loading state while calculating
  if (isCalculating) {
    const folderCount = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length;
    return (
      <LoadingState
        operation="Calculating folder depths"
        details={`Analyzing ${folderCount.toLocaleString()} folders...`}
        progress={calcProgress}
      />
    );
  }
  
  // Chart data
  const chartData = Object.entries(depthGroups)
    .map(([depth, data]) => ({
      depth: parseInt(depth),
      count: data.folders.length,
      size: data.totalSize,
    }))
    .sort((a, b) => a.depth - b.depth);
  
  const maxDepth = Math.max(...Array.from(folderDepths.values()), 0);
  const avgDepth = folderDepths.size > 0
    ? Array.from(folderDepths.values()).reduce((sum, d) => sum + d, 0) / folderDepths.size
    : 0;
  
  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  
  return (
    <div className="flex flex-col h-full overflow-auto p-6 bg-gray-50">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Header Stats */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Folder Depth Analysis</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="text-blue-600" size={20} />
                <span className="text-sm text-gray-600">Max Depth</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{maxDepth} levels</div>
            </div>
            
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Folder className="text-green-600" size={20} />
                <span className="text-sm text-gray-600">Total Folders</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {Object.keys(folderDepths).length.toLocaleString()}
              </div>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="text-purple-600" size={20} />
                <span className="text-sm text-gray-600">Average Depth</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{avgDepth.toFixed(1)} levels</div>
            </div>
          </div>
        </div>
        
        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Folders by Depth - Bar Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Folders by Depth (Count)</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <XAxis dataKey="depth" label={{ value: 'Depth Level', position: 'insideBottom', offset: -5 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884d8">
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[entry.depth % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-gray-500 py-12">No data to display</div>
            )}
          </div>
          
          {/* Storage by Depth - Bar Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Storage by Depth</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <XAxis dataKey="depth" label={{ value: 'Depth Level', position: 'insideBottom', offset: -5 }} />
                  <YAxis tickFormatter={(value) => formatSize(value)} />
                  <Tooltip formatter={(value: number) => formatSize(value)} />
                  <Bar dataKey="size" fill="#8884d8">
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[entry.depth % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-gray-500 py-12">No data to display</div>
            )}
          </div>
        </div>
        
        {/* Deepest Folders */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Deepest Folders</h3>
          {deepestFolders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Depth</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Size</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Modified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {deepestFolders.map(({ folder, depth }) => {
                    if (!folder) return null;
                    return (
                      <tr
                        key={folder.id}
                        onClick={() => onFileClick?.(folder)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Folder size={18} className="text-blue-500" />
                            <span className="font-medium text-gray-900">{folder.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                            Level {depth}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatSize(folder.calculatedSize || folder.size)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {folder.modifiedTime
                            ? new Date(folder.modifiedTime).toLocaleDateString()
                            : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">No folders found</div>
          )}
        </div>
      </div>
    </div>
  );
};
