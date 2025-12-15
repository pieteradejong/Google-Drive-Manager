/** Semantic Analysis View - Categorize folders by purpose */
import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Folder, Search, Filter } from 'lucide-react';
import { formatSize, getFolderPath } from '../../utils/navigation';
import {
  groupFoldersBySemantic,
  calculateSemanticStats,
  getCategoryByName,
  type SemanticCategory
} from '../../utils/semanticAnalysis';
import { measureSync } from '../../utils/performance';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface SemanticAnalysisViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#6366f1', '#14b8a6'];

export const SemanticAnalysisView = ({ files, childrenMap, onFileClick }: SemanticAnalysisViewProps) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [minSizeMB, setMinSizeMB] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // Get all folders
  const folders = useMemo(() => {
    return files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  }, [files]);
  
  // Group folders by semantic category with progress tracking
  const { categorized, uncategorized } = useMemo(() => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    // Simulate progress for user feedback
    const progressInterval = setInterval(() => {
      setAnalysisProgress(prev => Math.min(prev + 10, 90));
    }, 100);
    
    const result = measureSync('SemanticAnalysisView: groupFoldersBySemantic', () => {
      return groupFoldersBySemantic(folders, files, childrenMap);
    }, 500);
    
    clearInterval(progressInterval);
    setAnalysisProgress(100);
    
    // Small delay to show completion
    setTimeout(() => {
      setIsAnalyzing(false);
    }, 200);
    
    return result;
  }, [folders, files, childrenMap]);
  
  // Show loading state during analysis
  if (isAnalyzing) {
    return (
      <LoadingState
        operation="Analyzing folder semantics"
        details={`Categorizing ${folders.length} folders...`}
        progress={analysisProgress}
      />
    );
  }
  
  // Calculate total size for percentage calculations
  const totalDriveSize = useMemo(() => {
    return folders.reduce((sum, f) => sum + (f.calculatedSize || f.size || 0), 0);
  }, [folders]);
  
  // Calculate statistics
  const stats = useMemo(() => {
    return calculateSemanticStats(categorized, totalDriveSize);
  }, [categorized, totalDriveSize]);
  
  // Get folders for selected category
  const selectedFolders = useMemo(() => {
    if (!selectedCategory) return [];
    
    if (selectedCategory === 'Uncategorized') {
      return uncategorized;
    }
    
    return categorized[selectedCategory]?.folders || [];
  }, [selectedCategory, categorized, uncategorized]);
  
  // Filter selected folders by search and size
  const filteredFolders = useMemo(() => {
    let filtered = selectedFolders;
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(f => 
        f.name.toLowerCase().includes(query)
      );
    }
    
    // Filter by minimum size
    if (minSizeMB > 0) {
      const minSizeBytes = minSizeMB * 1024 * 1024;
      filtered = filtered.filter(f => 
        (f.calculatedSize || f.size || 0) >= minSizeBytes
      );
    }
    
    return filtered.sort((a, b) => 
      (b.calculatedSize || b.size || 0) - (a.calculatedSize || a.size || 0)
    );
  }, [selectedFolders, searchQuery, minSizeMB]);
  
  // Get classification info for a folder
  const getClassificationInfo = (folder: FileItem) => {
    if (selectedCategory === 'Uncategorized') {
      return { confidence: 'low', method: 'none' };
    }
    
    const categoryData = categorized[selectedCategory || ''];
    if (!categoryData) return { confidence: 'low', method: 'none' };
    
    const classification = categoryData.classifications.find(c => c.folder.id === folder.id);
    return classification || { confidence: 'low', method: 'unknown' };
  };
  
  // Format folder path
  const formatFolderPath = (folder: FileItem): string => {
    const path = getFolderPath(folder.parents[0] || null, files);
    if (path.length === 0) return 'Root';
    return '/' + path.map(f => f.name).join('/');
  };
  
  // Chart data for pie chart
  const pieChartData = useMemo(() => {
    return stats.map(stat => ({
      name: stat.name,
      value: stat.totalSize,
      percentage: stat.percentage
    }));
  }, [stats]);
  
  // Chart data for bar chart
  const barChartData = useMemo(() => {
    return stats.map(stat => ({
      name: stat.name,
      folders: stat.folderCount,
      size: stat.totalSize
    }));
  }, [stats]);
  
  return (
    <div className="flex h-full">
      {/* Category Sidebar */}
      <div className="w-80 border-r border-gray-200 bg-gray-50 overflow-auto">
        <div className="p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Semantic Categories</h2>
          <p className="text-xs text-gray-600">
            Folders categorized by name patterns and content
          </p>
        </div>
        
        <div className="p-2">
          {/* Statistics Summary */}
          <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200">
            <div className="text-xs text-gray-600 mb-1">Total Folders</div>
            <div className="text-2xl font-bold text-gray-900">{folders.length}</div>
            <div className="text-xs text-gray-500 mt-1">
              {Object.values(categorized).reduce((sum, cat) => sum + cat.folders.length, 0)} categorized,
              {' '}{uncategorized.length} uncategorized
            </div>
          </div>
          
          {/* Category List */}
          {stats.map((stat, index) => {
            const category = getCategoryByName(stat.name);
            const isSelected = selectedCategory === stat.name;
            
            return (
              <button
                key={stat.name}
                onClick={() => setSelectedCategory(isSelected ? null : stat.name)}
                className={`w-full flex items-center justify-between p-3 rounded-lg mb-2 transition-colors ${
                  isSelected
                    ? 'bg-blue-100 text-blue-900 border-2 border-blue-500'
                    : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-lg flex-shrink-0">{category?.icon || '📁'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{stat.name}</div>
                    <div className="text-xs text-gray-500">
                      {stat.folderCount} folders • {stat.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="text-xs font-semibold text-gray-600 flex-shrink-0 ml-2">
                  {formatSize(stat.totalSize)}
                </div>
              </button>
            );
          })}
          
          {/* Uncategorized */}
          {uncategorized.length > 0 && (
            <button
              onClick={() => setSelectedCategory(selectedCategory === 'Uncategorized' ? null : 'Uncategorized')}
              className={`w-full flex items-center justify-between p-3 rounded-lg mb-2 transition-colors ${
                selectedCategory === 'Uncategorized'
                  ? 'bg-gray-100 text-gray-900 border-2 border-gray-400'
                  : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-lg flex-shrink-0">❓</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">Uncategorized</div>
                  <div className="text-xs text-gray-500">
                    {uncategorized.length} folders
                  </div>
                </div>
              </div>
            </button>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {!selectedCategory ? (
          /* Overview Statistics */
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Semantic Analysis Overview</h2>
              <p className="text-gray-600 mb-6">
                Folders are automatically categorized by name patterns (keywords, regex) and content analysis.
                Select a category from the sidebar to view folders.
              </p>
              
              {/* Storage Distribution Pie Chart */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4">Storage Distribution by Category</h3>
                {pieChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => {
                          const category = getCategoryByName(entry.name);
                          return (
                            <Cell key={`cell-${index}`} fill={category?.color || COLORS[index % COLORS.length]} />
                          );
                        })}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatSize(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center text-gray-500 py-12">No categorized folders found</div>
                )}
              </div>
              
              {/* Folder Count Bar Chart */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Folder Count by Category</h3>
                {barChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barChartData}>
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="folders" fill="#3b82f6" name="Folder Count">
                        {barChartData.map((entry, index) => {
                          const category = getCategoryByName(entry.name);
                          return (
                            <Cell key={`cell-${index}`} fill={category?.color || COLORS[index % COLORS.length]} />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center text-gray-500 py-12">No categorized folders found</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Category Details */
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                    <span>{getCategoryByName(selectedCategory)?.icon || '📁'}</span>
                    {selectedCategory}
                  </h2>
                  <p className="text-gray-600 mt-1">
                    {filteredFolders.length} of {selectedFolders.length} folders
                    {selectedCategory !== 'Uncategorized' && (
                      <> • {formatSize((categorized[selectedCategory]?.totalSize || 0))} total</>
                    )}
                  </p>
                </div>
              </div>
              
              {/* Filters */}
              <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-200">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Search folders..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter size={18} className="text-gray-400" />
                  <label className="text-sm text-gray-600">Min size (MB):</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={minSizeMB}
                    onChange={(e) => setMinSizeMB(parseFloat(e.target.value) || 0)}
                    className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
              
              {/* Folder List */}
              {filteredFolders.length === 0 ? (
                <div className="text-center text-gray-500 py-12">
                  <Folder size={48} className="mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium mb-2">No folders found</p>
                  <p className="text-sm">
                    {searchQuery || minSizeMB > 0
                      ? 'Try adjusting your filters'
                      : 'This category is empty'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFolders.map((folder) => {
                    const classification = getClassificationInfo(folder);
                    const pathString = formatFolderPath(folder);
                    
                    return (
                      <div
                        key={folder.id}
                        onClick={() => onFileClick?.(folder)}
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Folder size={24} className="text-blue-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm mb-1">{folder.name}</div>
                            <div className="text-xs text-gray-500 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate" title={pathString}>{pathString}</span>
                              </div>
                              {selectedCategory !== 'Uncategorized' && (
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-0.5 rounded text-xs ${
                                    classification.confidence === 'high'
                                      ? 'bg-green-100 text-green-700'
                                      : classification.confidence === 'medium'
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}>
                                    {classification.confidence} confidence ({classification.method})
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <div className="text-sm font-semibold text-gray-700">
                            {formatSize(folder.calculatedSize || folder.size || 0)}
                          </div>
                          {folder.modifiedTime && (
                            <div className="text-xs text-gray-500">
                              Modified {new Date(folder.modifiedTime).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
