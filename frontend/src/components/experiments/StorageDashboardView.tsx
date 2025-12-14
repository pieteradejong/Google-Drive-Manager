/** Storage Breakdown Dashboard - Quick overview of storage usage */
import { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { HardDrive, Folder, File, TrendingUp } from 'lucide-react';
import { groupByType, sortBySize, formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

interface StorageDashboardViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
  stats?: {
    total_files: number;
    total_size: number;
    folder_count: number;
    file_count: number;
  };
  quotaInfo?: {
    used?: string;
    total_quota?: string;
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

export const StorageDashboardView = ({ files, childrenMap, onFileClick, stats, quotaInfo }: StorageDashboardViewProps) => {
  // Group files by type for pie chart
  const typeGroups = useMemo(() => groupByType(files), [files]);
  
  // Prepare pie chart data
  const pieData = useMemo(() => {
    return Object.entries(typeGroups).map(([category, items]) => {
      const totalSize = items.reduce((sum, f) => sum + (f.calculatedSize || f.size || 0), 0);
      return {
        name: category,
        value: totalSize,
        count: items.length
      };
    }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [typeGroups]);
  
  // Get top 10 largest folders
  const topFolders = useMemo(() => {
    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    return sortBySize(folders).slice(0, 10);
  }, [files]);
  
  // Prepare bar chart data for top folders
  const barData = useMemo(() => {
    return topFolders.map(folder => ({
      name: folder.name.length > 20 ? folder.name.substring(0, 17) + '...' : folder.name,
      size: folder.calculatedSize || folder.size || 0,
      fullName: folder.name,
      id: folder.id
    }));
  }, [topFolders]);
  
  // Calculate storage percentage
  const storagePercent = useMemo(() => {
    if (!quotaInfo?.used || !quotaInfo?.total_quota) return 0;
    const used = parseInt(quotaInfo.used);
    const total = parseInt(quotaInfo.total_quota);
    if (total === 0) return 0;
    return (used / total) * 100;
  }, [quotaInfo]);
  
  // Calculate stats
  const totalSize = stats?.total_size || files.reduce((sum, f) => sum + (f.calculatedSize || f.size || 0), 0);
  const totalFiles = stats?.total_files || files.length;
  const folderCount = stats?.folder_count || files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length;
  const fileCount = stats?.file_count || files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').length;
  
  return (
    <div className="flex flex-col h-full overflow-auto p-6 bg-gray-50">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <HardDrive size={20} />
              <span className="text-sm">Total Storage</span>
            </div>
            <div className="text-2xl font-bold">{formatSize(totalSize)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <File size={20} />
              <span className="text-sm">Total Files</span>
            </div>
            <div className="text-2xl font-bold">{totalFiles.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Folder size={20} />
              <span className="text-sm">Folders</span>
            </div>
            <div className="text-2xl font-bold">{folderCount.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <TrendingUp size={20} />
              <span className="text-sm">Quota Used</span>
            </div>
            <div className="text-2xl font-bold">
              {quotaInfo?.used && quotaInfo?.total_quota 
                ? `${storagePercent.toFixed(1)}%`
                : 'N/A'}
            </div>
          </div>
        </div>
        
        {/* Storage Quota Progress */}
        {quotaInfo?.used && quotaInfo?.total_quota && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Storage Quota</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Used</span>
                <span className="font-medium">
                  {formatSize(parseInt(quotaInfo.used))} / {formatSize(parseInt(quotaInfo.total_quota))}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className={`h-4 rounded-full transition-all ${
                    storagePercent > 90 ? 'bg-red-500' : storagePercent > 75 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(storagePercent, 100)}%` }}
                />
              </div>
              <div className="text-xs text-gray-500">
                {formatSize(parseInt(quotaInfo.total_quota) - parseInt(quotaInfo.used))} remaining
              </div>
            </div>
          </div>
        )}
        
        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Storage by Type - Pie Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Storage by File Type</h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatSize(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-gray-500 py-12">No data to display</div>
            )}
            <div className="mt-4 space-y-1">
              {pieData.map((item, index) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span>{item.name}</span>
                  </div>
                  <div className="font-medium">
                    {formatSize(item.value)} ({item.count} {item.count === 1 ? 'item' : 'items'})
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Top 10 Largest Folders - Bar Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Top 10 Largest Folders</h3>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} fontSize={10} />
                  <YAxis tickFormatter={(value) => formatSize(value)} />
                  <Tooltip
                    formatter={(value: number) => formatSize(value)}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Bar dataKey="size" fill="#0088FE" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-gray-500 py-12">No folders to display</div>
            )}
          </div>
        </div>
        
        {/* Top Folders List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Largest Folders</h3>
          <div className="space-y-2">
            {topFolders.map((folder, index) => (
              <div
                key={folder.id}
                onClick={() => onFileClick?.(folder)}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 font-medium w-8">{index + 1}.</span>
                  <Folder size={20} className="text-blue-500" />
                  <span className="font-medium">{folder.name}</span>
                </div>
                <div className="text-sm font-semibold text-gray-700">
                  {formatSize(folder.calculatedSize || folder.size || 0)}
                </div>
              </div>
            ))}
            {topFolders.length === 0 && (
              <div className="text-center text-gray-500 py-8">No folders found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
