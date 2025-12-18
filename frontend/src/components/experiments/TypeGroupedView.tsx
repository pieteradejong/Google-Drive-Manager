/** Type-Based Organization - Grouped by file type (Enhanced with charts) */
import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { File, Folder, Image, FileText, Video, Music } from 'lucide-react';
import { groupByType, formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

interface TypeGroupedViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

const getTypeIcon = (category: string) => {
  switch (category) {
    case 'Folders':
      return <Folder size={20} className="text-blue-500" />;
    case 'Images':
      return <Image size={20} className="text-green-500" />;
    case 'Documents':
      return <FileText size={20} className="text-yellow-500" />;
    case 'Videos':
      return <Video size={20} className="text-red-500" />;
    case 'Audio':
      return <Music size={20} className="text-purple-500" />;
    default:
      return <File size={20} className="text-gray-400" />;
  }
};

export const TypeGroupedView = ({ files, onFileClick }: TypeGroupedViewProps) => {
  // Memoize expensive grouping operation
  const groups = useMemo(() => groupByType(files), [files]);
  const categories = useMemo(() => Object.keys(groups), [groups]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    categories.length > 0 ? categories[0] : null
  );
  
  const selectedFiles = useMemo(
    () => selectedCategory ? groups[selectedCategory] || [] : [],
    [selectedCategory, groups]
  );
  
  const getCategoryStats = useMemo(() => {
    return (category: string) => {
      const items = groups[category] || [];
      const totalSize = items.reduce((sum, f) => sum + (f.calculatedSize || f.size || 0), 0);
      return { count: items.length, totalSize };
    };
  }, [groups]);
  
  // Prepare chart data
  const chartData = useMemo(() => {
    return categories.map((category) => {
      const stats = getCategoryStats(category);
      return {
        name: category,
        value: stats.totalSize,
        count: stats.count
      };
    }).filter(item => item.value > 0);
  }, [categories, getCategoryStats]);

  return (
    <div className="flex h-full">
      {/* Category Sidebar */}
      <div className="w-64 border-r border-gray-200 bg-gray-50 overflow-auto">
        <div className="p-3 font-semibold text-sm text-gray-700 border-b border-gray-200">
          File Types
        </div>
        <div className="p-2">
          {categories.map((category) => {
            const stats = getCategoryStats(category);
            const isSelected = selectedCategory === category;
            return (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`w-full flex items-center justify-between p-3 rounded-lg mb-1 transition-colors ${
                  isSelected
                    ? 'bg-blue-100 text-blue-900'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  {getTypeIcon(category)}
                  <span className="text-sm font-medium">{category}</span>
                </div>
                <div className="text-xs text-gray-600">
                  {stats.count}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Storage by Type Chart */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Storage Distribution by Type</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatSize(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* Storage by Type Chart */}
        {!selectedCategory && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <h3 className="text-lg font-semibold mb-4">Storage Distribution by Type</h3>
            {(() => {
              const chartData = Object.entries(groups).map(([category, items]) => ({
                name: category,
                value: items.reduce((sum, f) => sum + (f.calculatedSize || f.size || 0), 0),
                count: items.length
              })).filter(d => d.value > 0);
              
              return chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {chartData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatSize(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-gray-500 py-8">No data to display</div>
              );
            })()}
          </div>
        )}

        {selectedCategory && (
          <>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                {getTypeIcon(selectedCategory)}
                <h2 className="text-xl font-semibold">{selectedCategory}</h2>
              </div>
              <div className="text-sm text-gray-600">
                {selectedFiles.length} {selectedFiles.length === 1 ? 'item' : 'items'} •{' '}
                {formatSize(
                  selectedFiles.reduce((sum, f) => sum + (f.calculatedSize || f.size || 0), 0)
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {selectedFiles.map((item) => {
                const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                return (
                  <div
                    key={item.id}
                    onClick={() => onFileClick?.(item)}
                    className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    {isFolder ? (
                      <Folder size={24} className="text-blue-500 flex-shrink-0" />
                    ) : (
                      <File size={24} className="text-gray-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      <div className="text-xs text-gray-500">
                        {formatSize(item.calculatedSize || item.size)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {selectedFiles.length === 0 && (
              <div className="text-center text-gray-500 mt-8">
                No files in this category
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
