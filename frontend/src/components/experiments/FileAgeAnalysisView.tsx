/** File Age Analysis - Find old and unused files */
import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar, Clock, File, Folder } from 'lucide-react';
import { formatSize, sortByDate } from '../../utils/navigation';
import { measureSync } from '../../utils/performance';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface FileAgeAnalysisViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

const AGE_BUCKETS = [
  { label: '0-30 days', days: 30, color: '#10b981' },
  { label: '30-90 days', days: 90, color: '#3b82f6' },
  { label: '90-180 days', days: 180, color: '#f59e0b' },
  { label: '180-365 days', days: 365, color: '#ef4444' },
  { label: '1+ years', days: Infinity, color: '#991b1b' },
];

export const FileAgeAnalysisView = ({ files, onFileClick }: FileAgeAnalysisViewProps) => {
  const [ageFilter, setAgeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'oldest' | 'newest'>('oldest');
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // Categorize files by age
  const ageBuckets = useMemo(() => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    const result = measureSync('FileAgeAnalysisView: categorizeByAge', () => {
    const now = Date.now();
    const buckets: Record<string, { files: FileItem[]; totalSize: number }> = {};
    
    AGE_BUCKETS.forEach(bucket => {
      buckets[bucket.label] = { files: [], totalSize: 0 };
    });
    
    files.forEach(file => {
      if (!file.modifiedTime) {
        buckets['1+ years'].files.push(file);
        buckets['1+ years'].totalSize += file.calculatedSize || file.size || 0;
        return;
      }
      
      const modifiedDate = new Date(file.modifiedTime).getTime();
      const ageDays = (now - modifiedDate) / (1000 * 60 * 60 * 24);
      
      for (let i = AGE_BUCKETS.length - 1; i >= 0; i--) {
        const bucket = AGE_BUCKETS[i];
        if (ageDays >= bucket.days) {
          buckets[bucket.label].files.push(file);
          buckets[bucket.label].totalSize += file.calculatedSize || file.size || 0;
          break;
        }
      }
    });
    
    return buckets;
    }, 500);
    
    setAnalysisProgress(100);
    setTimeout(() => {
      setIsAnalyzing(false);
    }, 200);
    
    return result;
  }, [files]);
  
  // Prepare chart data (must be before early return to follow Rules of Hooks)
  const chartData = useMemo(() => {
    if (!ageBuckets) return [];
    return AGE_BUCKETS.map(bucket => {
      const bucketData = ageBuckets[bucket.label];
      return {
        name: bucket.label,
        count: bucketData?.files.length || 0,
        size: bucketData?.totalSize || 0,
        color: bucket.color
      };
    });
  }, [ageBuckets]);
  
  // Get files for selected age bucket (must be before early return to follow Rules of Hooks)
  const filteredFiles = useMemo(() => {
    if (ageFilter === 'all') {
      return files;
    }
    return ageBuckets?.[ageFilter]?.files || [];
  }, [ageFilter, ageBuckets, files]);
  
  // Sort filtered files (must be before early return to follow Rules of Hooks)
  const sortedFiles = useMemo(() => {
    const sorted = sortByDate(filteredFiles);
    return sortBy === 'oldest' ? sorted.reverse() : sorted;
  }, [filteredFiles, sortBy]);
  
  // Get oldest files (must be before early return to follow Rules of Hooks)
  const oldestFiles = useMemo(() => {
    const filesWithDate = files
      .filter(f => f.modifiedTime)
      .sort((a, b) => {
        const dateA = new Date(a.modifiedTime!).getTime();
        const dateB = new Date(b.modifiedTime!).getTime();
        return dateA - dateB; // Oldest first
      });
    return filesWithDate.slice(0, 50);
  }, [files]);
  
  // Show loading state during analysis
  if (isAnalyzing) {
    const fileCount = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').length;
    return (
      <LoadingState
        operation="Analyzing file ages"
        details={`Categorizing ${fileCount.toLocaleString()} files by age...`}
        progress={analysisProgress}
      />
    );
  }
  
  const getAgeInDays = (modifiedTime: string | undefined): number => {
    if (!modifiedTime) return Infinity;
    const now = Date.now();
    const modified = new Date(modifiedTime).getTime();
    return (now - modified) / (1000 * 60 * 60 * 24);
  };
  
  const formatAge = (days: number): string => {
    if (days === Infinity) return 'Unknown';
    if (days < 30) return `${Math.floor(days)} days`;
    if (days < 365) return `${Math.floor(days / 30)} months`;
    return `${Math.floor(days / 365)} years`;
  };
  
  return (
    <div className="flex flex-col h-full overflow-auto p-6 bg-gray-50">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
            <Calendar size={24} />
            File Age Analysis
          </h2>
          <p className="text-gray-600">
            Analyze files by age to identify old or unused files that can be cleaned up
          </p>
        </div>
        
        {/* Age Distribution Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Files by Age</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" />
              <YAxis yAxisId="left" orientation="left" tickFormatter={(value) => value.toLocaleString()} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatSize(value)} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'count') return `${value} files`;
                  return formatSize(value);
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="count" fill="#3b82f6" name="File Count" />
              <Bar yAxisId="right" dataKey="size" fill="#10b981" name="Total Size" />
            </BarChart>
          </ResponsiveContainer>
          
          {/* Age Bucket Summary */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-6">
            {AGE_BUCKETS.map(bucket => {
              const data = ageBuckets[bucket.label];
              return (
                <div
                  key={bucket.label}
                  onClick={() => setAgeFilter(ageFilter === bucket.label ? 'all' : bucket.label)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    ageFilter === bucket.label
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: bucket.color }} />
                    <span className="text-sm font-medium">{bucket.label}</span>
                  </div>
                  <div className="text-2xl font-bold">{data.files.length}</div>
                  <div className="text-xs text-gray-600">{formatSize(data.totalSize)}</div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Oldest Files */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Clock size={20} />
              Oldest Files (Top 50)
            </h3>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Sort:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'oldest' | 'newest')}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="oldest">Oldest First</option>
                <option value="newest">Newest First</option>
              </select>
            </div>
          </div>
          
          <div className="space-y-2">
            {oldestFiles.slice(0, 50).map((file) => {
              const ageDays = getAgeInDays(file.modifiedTime);
              const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
              
              return (
                <div
                  key={file.id}
                  onClick={() => onFileClick?.(file)}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {isFolder ? (
                      <Folder size={20} className="text-blue-500" />
                    ) : (
                      <File size={20} className="text-gray-400" />
                    )}
                    <div>
                      <div className="font-medium text-sm">{file.name}</div>
                      <div className="text-xs text-gray-500">
                        {file.modifiedTime 
                          ? `Modified ${new Date(file.modifiedTime).toLocaleDateString()}`
                          : 'No date'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-700">
                      {formatAge(ageDays)} old
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatSize(file.calculatedSize || file.size || 0)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Filtered Files List */}
        {ageFilter !== 'all' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">
              Files in "{ageFilter}" ({sortedFiles.length} files)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedFiles.slice(0, 300).map((file) => {
                const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                return (
                  <div
                    key={file.id}
                    onClick={() => onFileClick?.(file)}
                    className="flex items-center gap-2 p-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    {isFolder ? (
                      <Folder size={16} className="text-blue-500" />
                    ) : (
                      <File size={16} className="text-gray-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{file.name}</div>
                      <div className="text-xs text-gray-500">
                        {formatSize(file.calculatedSize || file.size || 0)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {sortedFiles.length > 300 && (
              <div className="text-center text-sm text-gray-500 mt-4">
                Showing first 300 of {sortedFiles.length} files
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
