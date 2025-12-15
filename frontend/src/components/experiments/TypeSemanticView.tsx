/** Type + Semantic Analysis View - Combine file types with semantic categories */
import { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Folder, File, Filter, Image, Video, Music, FileText } from 'lucide-react';
import { formatSize, getFolderPath } from '../../utils/navigation';
import {
  groupFoldersBySemantic,
  getCategoryByName
} from '../../utils/semanticAnalysis';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface TypeSemanticViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

const FILE_TYPE_CATEGORIES = [
  { name: 'Images', pattern: /^image\//, icon: Image, color: '#10b981' },
  { name: 'Videos', pattern: /^video\//, icon: Video, color: '#ef4444' },
  { name: 'Audio', pattern: /^audio\//, icon: Music, color: '#ec4899' },
  { name: 'Documents', pattern: /(application\/pdf|application\/vnd\.google-apps\.document|application\/msword|application\/vnd\.openxmlformats)/, icon: FileText, color: '#f59e0b' },
  { name: 'Other', pattern: /.*/, icon: File, color: '#6b7280' }
];

interface MatrixCell {
  category: string;
  fileType: string;
  fileCount: number;
  totalSize: number;
  files: FileItem[];
}

export const TypeSemanticView = ({ files, childrenMap, onFileClick }: TypeSemanticViewProps) => {
  const [selectedCell, setSelectedCell] = useState<{ category: string; fileType: string } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // Get all folders
  const folders = useMemo(() => {
    return files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  }, [files]);
  
  // Group folders by semantic category
  const { categorized } = useMemo(() => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    const progressInterval = setInterval(() => {
      setAnalysisProgress(prev => Math.min(prev + 15, 60));
    }, 150);
    
    const result = groupFoldersBySemantic(folders, files, childrenMap);
    
    clearInterval(progressInterval);
    setAnalysisProgress(60);
    
    return result;
  }, [folders, files, childrenMap]);
  
  // Get file type for a file
  const getFileType = (file: FileItem): string => {
    for (const typeCategory of FILE_TYPE_CATEGORIES) {
      if (typeCategory.pattern.test(file.mimeType)) {
        return typeCategory.name;
      }
    }
    return 'Other';
  };
  
  // Build matrix data
  const matrixData = useMemo(() => {
    const matrix: MatrixCell[] = [];
    const fileMap = new Map(files.map(f => [f.id, f]));
    
    // Process each category
    Object.entries(categorized).forEach(([categoryName, categoryData]) => {
      // Get all files in folders of this category
      const categoryFiles: FileItem[] = [];
      categoryData.folders.forEach(folder => {
        const children = (childrenMap[folder.id] || [])
          .map(id => fileMap.get(id))
          .filter((f): f is FileItem => f !== undefined && f.mimeType !== 'application/vnd.google-apps.folder');
        categoryFiles.push(...children);
      });
      
      // Group by file type
      FILE_TYPE_CATEGORIES.forEach(fileTypeCategory => {
        const matchingFiles = categoryFiles.filter(f => getFileType(f) === fileTypeCategory.name);
        
        if (matchingFiles.length > 0 || selectedCell?.category === categoryName || selectedCell?.fileType === fileTypeCategory.name) {
          const totalSize = matchingFiles.reduce((sum, f) => sum + (f.size || 0), 0);
          matrix.push({
            category: categoryName,
            fileType: fileTypeCategory.name,
            fileCount: matchingFiles.length,
            totalSize,
            files: matchingFiles
          });
        }
      });
    });
    
    setAnalysisProgress(90);
    
    setTimeout(() => {
      setIsAnalyzing(false);
    }, 200);
    
    return matrix;
  }, [categorized, files, childrenMap, selectedCell]);
  
  // Show loading state during analysis
  if (isAnalyzing) {
    return (
      <LoadingState
        operation="Analyzing file types and semantic categories"
        details={`Categorizing ${folders.length} folders and analyzing file types...`}
        progress={analysisProgress}
      />
    );
  }
  
  // Get all photos across all folders (cross-folder aggregation)
  const allPhotos = useMemo(() => {
    return files.filter(f => 
      f.mimeType.startsWith('image/') && 
      f.mimeType !== 'application/vnd.google-apps.folder'
    );
  }, [files]);
  
  // Get files for selected cell
  const selectedFiles = useMemo(() => {
    if (showAllPhotos) return allPhotos;
    if (!selectedCell) return [];
    const cell = matrixData.find(
      c => c.category === selectedCell.category && c.fileType === selectedCell.fileType
    );
    return cell?.files || [];
  }, [selectedCell, matrixData, showAllPhotos, allPhotos]);
  
  // Get all categories
  const categories = useMemo(() => {
    return Object.keys(categorized).filter(name => categorized[name].folders.length > 0);
  }, [categorized]);
  
  // Format folder path
  const formatFolderPath = (folder: FileItem): string => {
    const path = getFolderPath(folder.parents[0] || null, files);
    if (path.length === 0) return 'Root';
    return '/' + path.map(f => f.name).join('/');
  };
  
  // Get file's folder path
  const getFileFolderPath = (file: FileItem): string => {
    if (file.parents.length === 0) return 'Root';
    const parentFolder = files.find(f => f.id === file.parents[0]);
    if (!parentFolder) return 'Unknown';
    return formatFolderPath(parentFolder);
  };
  
  // Chart data for selected category
  const categoryChartData = useMemo(() => {
    if (!selectedCategory) return [];
    return FILE_TYPE_CATEGORIES.map(typeCategory => {
      const cell = matrixData.find(
        c => c.category === selectedCategory && c.fileType === typeCategory.name
      );
      return {
        name: typeCategory.name,
        count: cell?.fileCount || 0,
        size: cell?.totalSize || 0
      };
    }).filter(d => d.count > 0);
  }, [selectedCategory, matrixData]);
  
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
              <File size={24} />
              Type + Semantic Analysis
            </h2>
            <p className="text-gray-600 text-sm mt-1">
              See what file types exist in each semantic category. Cross-folder aggregation available.
            </p>
          </div>
          
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-gray-400" />
              <select
                value={selectedCategory || ''}
                onChange={(e) => {
                  setSelectedCategory(e.target.value || null);
                  setSelectedCell(null);
                  setShowAllPhotos(false);
                }}
                className="border border-gray-300 rounded px-3 py-1 text-sm"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            
            <button
              onClick={() => {
                setShowAllPhotos(!showAllPhotos);
                setSelectedCell(null);
                setSelectedCategory(null);
              }}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                showAllPhotos
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Show All Photos
            </button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {showAllPhotos ? (
            /* All Photos View */
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">
                All Photos Across All Folders ({allPhotos.length} files, {formatSize(allPhotos.reduce((sum, f) => sum + (f.size || 0), 0))})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {selectedFiles.slice(0, 300).map((file) => {
                  const folderPath = getFileFolderPath(file);
                  return (
                    <div
                      key={file.id}
                      onClick={() => onFileClick?.(file)}
                      className="flex items-center gap-2 p-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <Image size={20} className="text-green-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{file.name}</div>
                        <div className="text-xs text-gray-500 truncate" title={folderPath}>
                          {folderPath}
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 flex-shrink-0">
                        {formatSize(file.size || 0)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedFiles.length > 300 && (
                <div className="text-center text-sm text-gray-500 mt-4">
                  Showing first 300 of {selectedFiles.length} photos
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Matrix View */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">File Type × Category Matrix</h3>
                
                {categories.length === 0 ? (
                  <div className="text-center text-gray-500 py-12">
                    <p>No categorized folders found. Run semantic analysis first.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold border-b border-gray-200">Category</th>
                          {FILE_TYPE_CATEGORIES.map(typeCategory => {
                            const Icon = typeCategory.icon;
                            return (
                              <th
                                key={typeCategory.name}
                                className="px-4 py-3 text-center text-sm font-semibold border-b border-gray-200"
                              >
                                <div className="flex items-center justify-center gap-2">
                                  <Icon size={18} className={typeCategory.color} />
                                  <span>{typeCategory.name}</span>
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {categories.map(categoryName => {
                          const category = getCategoryByName(categoryName);
                          
                          return (
                            <tr
                              key={categoryName}
                              className={selectedCategory === categoryName ? 'bg-blue-50' : 'hover:bg-gray-50'}
                            >
                              <td className="px-4 py-3 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                  <span>{category?.icon || '📁'}</span>
                                  <span className="font-medium text-sm">{categoryName}</span>
                                </div>
                              </td>
                              {FILE_TYPE_CATEGORIES.map(typeCategory => {
                                const cell = matrixData.find(
                                  c => c.category === categoryName && c.fileType === typeCategory.name
                                );
                                const isSelected = selectedCell?.category === categoryName && selectedCell?.fileType === typeCategory.name;
                                
                                return (
                                  <td
                                    key={typeCategory.name}
                                    onClick={() => {
                                      if (cell && cell.files.length > 0) {
                                        setSelectedCell(isSelected ? null : { category: categoryName, fileType: typeCategory.name });
                                      }
                                    }}
                                    className={`px-4 py-3 text-center border-b border-gray-100 ${
                                      cell && cell.files.length > 0
                                        ? 'cursor-pointer hover:bg-blue-50'
                                        : ''
                                    } ${isSelected ? 'bg-blue-100 ring-2 ring-blue-500' : ''}`}
                                    title={
                                      cell
                                        ? `${cell.fileCount} files, ${formatSize(cell.totalSize)}`
                                        : 'No files'
                                    }
                                  >
                                    {cell && cell.files.length > 0 ? (
                                      <div>
                                        <div className="font-semibold text-sm">{cell.fileCount}</div>
                                        <div className="text-xs text-gray-600">{formatSize(cell.totalSize)}</div>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs">-</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              
              {/* Category Type Distribution Chart */}
              {selectedCategory && categoryChartData.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold mb-4">
                    File Type Distribution: {selectedCategory}
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={categoryChartData}>
                      <XAxis dataKey="name" />
                      <YAxis yAxisId="left" orientation="left" />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatSize(value)} />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === 'count') return `${value} files`;
                          return formatSize(value);
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="count" fill="#3b82f6" name="File Count" />
                      <Bar yAxisId="right" dataKey="size" fill="#10b981" name="Total Size">
                        {categoryChartData.map((entry, index) => {
                          const typeCategory = FILE_TYPE_CATEGORIES.find(t => t.name === entry.name);
                          return (
                            <Cell key={`cell-${index}`} fill={typeCategory?.color || '#6b7280'} />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              
              {/* Selected Cell Details */}
              {selectedCell && selectedFiles.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">
                      Files: {selectedCell.category} × {selectedCell.fileType}
                    </h3>
                    <button
                      onClick={() => setSelectedCell(null)}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      Clear selection
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {selectedFiles.slice(0, 300).map((file) => {
                      const folderPath = getFileFolderPath(file);
                      const typeCategory = FILE_TYPE_CATEGORIES.find(t => t.name === selectedCell.fileType);
                      const Icon = typeCategory?.icon || File;
                      
                      return (
                        <div
                          key={file.id}
                          onClick={() => onFileClick?.(file)}
                          className="flex items-center gap-2 p-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                        >
                          <Icon size={20} className={typeCategory?.color || '#6b7280'} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{file.name}</div>
                            <div className="text-xs text-gray-500 truncate" title={folderPath}>
                              {folderPath}
                            </div>
                          </div>
                          <div className="text-xs text-gray-600 flex-shrink-0">
                            {formatSize(file.size || 0)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {selectedFiles.length > 300 && (
                    <div className="text-center text-sm text-gray-500 mt-4">
                      Showing first 300 of {selectedFiles.length} files
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
