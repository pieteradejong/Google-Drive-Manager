/** Folder Depth Analysis - Understand folder structure complexity */
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Folder, Layers, TrendingUp } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import { measureSync } from '../../utils/performance';
import type { FileItem } from '../../types/drive';

interface FolderDepthViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

interface DepthStats {
  depth: number;
  folderCount: number;
  totalSize: number;
  deepestPaths: Array<{ path: string[]; folder: FileItem }>;
}

export const FolderDepthView = ({ files, childrenMap, onFileClick }: FolderDepthViewProps) => {
  // Calculate depth for each folder
  const folderDepths = useMemo(() => {
    return measureSync('FolderDepthView: calculateDepths', () => {
      const depths = new Map<string, number>();
      const visited = new Set<string>();
      
      const calculateDepth = (folderId: string, currentDepth: number = 0): number => {
        // Prevent cycles
        if (visited.has(folderId)) {
          return depths.get(folderId) || currentDepth;
        }
        visited.add(folderId);
        
        const folder = files.find(f => f.id === folderId);
        if (!folder || folder.mimeType !== 'application/vnd.google-apps.folder') {
          return currentDepth;
        }
        
        // Get parent depth
        if (folder.parents.length === 0) {
          depths.set(folderId, 0);
          return 0;
        }
        
        // Calculate max parent depth
        let maxParentDepth = 0;
        for (const parentId of folder.parents) {
          if (!depths.has(parentId)) {
            calculateDepth(parentId, currentDepth - 1);
          }
          maxParentDepth = Math.max(maxParentDepth, depths.get(parentId) || 0);
        }
        
        const depth = maxParentDepth + 1;
        depths.set(folderId, depth);
        return depth;
      };
      
      // Calculate depth for all folders
      files.forEach(file => {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          calculateDepth(file.id);
        }
      });
      
      return depths;
    }, 500); // Warn if >500ms
  }, [files, childrenMap]);
  
  // Build depth statistics
  const depthStats = useMemo(() => {
    const stats: Record<number, DepthStats> = {};
    const deepestPaths: Array<{ path: string[]; folder: FileItem }> = [];
    
    files.forEach(file => {
      if (file.mimeType !== 'application/vnd.google-apps.folder') return;
      
      const depth = folderDepths.get(file.id) || 0;
      
      if (!stats[depth]) {
        stats[depth] = {
          depth,
          folderCount: 0,
          totalSize: 0,
          deepestPaths: []
        };
      }
      
      stats[depth].folderCount++;
      stats[depth].totalSize += file.calculatedSize || file.size || 0;
    });
    
    // Find deepest paths
    const buildPath = (folderId: string, path: string[] = []): string[] => {
      const folder = files.find(f => f.id === folderId);
      if (!folder) return path;
      
      const newPath = [folder.name, ...path];
      
      if (folder.parents.length === 0) {
        return newPath;
      }
      
      // Follow first parent
      return buildPath(folder.parents[0], newPath);
    };
    
    // Get top 10 deepest folders
    const foldersByDepth = Array.from(folderDepths.entries())
      .map(([id, depth]) => ({ id, depth, folder: files.find(f => f.id === id) }))
      .filter(item => item.folder)
      .sort((a, b) => b.depth - a.depth)
      .slice(0, 10);
    
    foldersByDepth.forEach(({ id, depth, folder }) => {
      if (folder) {
        const path = buildPath(id).reverse();
        deepestPaths.push({ path, folder });
      }
    });
    
    return { stats, deepestPaths };
  }, [files, folderDepths]);
  
  // Prepare chart data
  const chartData = useMemo(() => {
    const maxDepth = Math.max(...Object.keys(depthStats.stats).map(Number));
    const data = [];
    
    for (let i = 0; i <= maxDepth; i++) {
      const stat = depthStats.stats[i];
      if (stat) {
        data.push({
          depth: `Level ${i}`,
          folders: stat.folderCount,
          size: stat.totalSize
        });
      }
    }
    
    return data;
  }, [depthStats]);
  
  // Calculate statistics
  const maxDepth = Math.max(...Object.keys(depthStats.stats).map(Number), 0);
  const avgDepth = useMemo(() => {
    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    if (folders.length === 0) return 0;
    const totalDepth = folders.reduce((sum, f) => sum + (folderDepths.get(f.id) || 0), 0);
    return totalDepth / folders.length;
  }, [files, folderDepths]);
  
  return (
    <div className="flex flex-col h-full overflow-auto p-6 bg-gray-50">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Layers size={20} />
              <span className="text-sm">Max Depth</span>
            </div>
            <div className="text-2xl font-bold">{maxDepth} levels</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <TrendingUp size={20} />
              <span className="text-sm">Average Depth</span>
            </div>
            <div className="text-2xl font-bold">{avgDepth.toFixed(1)} levels</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Folder size={20} />
              <span className="text-sm">Total Folders</span>
            </div>
            <div className="text-2xl font-bold">
              {files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length}
            </div>
          </div>
        </div>
        
        {/* Depth Distribution Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Folders by Depth Level</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <XAxis dataKey="depth" />
                <YAxis yAxisId="left" orientation="left" />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatSize(value)} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'folders') return `${value} folders`;
                    return formatSize(value);
                  }}
                />
                <Bar yAxisId="left" dataKey="folders" fill="#3b82f6" name="Folder Count" />
                <Bar yAxisId="right" dataKey="size" fill="#10b981" name="Total Size" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-gray-500 py-12">No data to display</div>
          )}
        </div>
        
        {/* Deepest Paths */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Deepest Folder Paths</h3>
          <div className="space-y-3">
            {depthStats.deepestPaths.map(({ path, folder }, index) => (
              <div
                key={folder.id}
                onClick={() => onFileClick?.(folder)}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-gray-400 font-medium w-8">{index + 1}.</span>
                  <Folder size={20} className="text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-sm">
                      {path.map((name, i) => (
                        <span key={i}>
                          <span className="font-medium">{name}</span>
                          {i < path.length - 1 && <span className="text-gray-400 mx-1">/</span>}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Depth: {folderDepths.get(folder.id) || 0} levels
                    </div>
                  </div>
                </div>
                <div className="text-sm font-semibold text-gray-700 flex-shrink-0">
                  {formatSize(folder.calculatedSize || folder.size || 0)}
                </div>
              </div>
            ))}
            {depthStats.deepestPaths.length === 0 && (
              <div className="text-center text-gray-500 py-8">No deep folders found</div>
            )}
          </div>
        </div>
        
        {/* Depth Statistics Table */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Depth Statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-semibold">Depth Level</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold">Folder Count</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold">Total Size</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(depthStats.stats)
                  .sort((a, b) => a.depth - b.depth)
                  .map(stat => (
                    <tr key={stat.depth} className="border-b border-gray-200">
                      <td className="px-4 py-2">Level {stat.depth}</td>
                      <td className="px-4 py-2">{stat.folderCount}</td>
                      <td className="px-4 py-2 font-medium">{formatSize(stat.totalSize)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
