/** Activity Timeline - Calendar heatmap and activity patterns */
import { useMemo, useState, useEffect } from 'react';
import { Calendar, TrendingUp, File, Folder } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import { measureSync } from '../../utils/performance';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface ActivityTimelineViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

export const ActivityTimelineView = ({ files, childrenMap, onFileClick }: ActivityTimelineViewProps) => {
  const [viewMode, setViewMode] = useState<'created' | 'modified'>('modified');
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month');
  const [isProcessing, setIsProcessing] = useState(true);
  const [processProgress, setProcessProgress] = useState(0);
  
  // Group files by date
  const activityByDate = useMemo(() => {
    setIsProcessing(true);
    setProcessProgress(0);
    
    const result = measureSync('ActivityTimelineView: groupByDate', () => {
    const activity: Record<string, { created: FileItem[]; modified: FileItem[] }> = {};
    
    files.forEach(file => {
      if (file.createdTime) {
        const date = new Date(file.createdTime).toISOString().split('T')[0];
        if (!activity[date]) {
          activity[date] = { created: [], modified: [] };
        }
        activity[date].created.push(file);
      }
      
      if (file.modifiedTime) {
        const date = new Date(file.modifiedTime).toISOString().split('T')[0];
        if (!activity[date]) {
          activity[date] = { created: [], modified: [] };
        }
        activity[date].modified.push(file);
      }
    });
    
    return activity;
    }, 500);
    
    setProcessProgress(100);
    setTimeout(() => {
      setIsProcessing(false);
    }, 200);
    
    return result;
  }, [files]);
  
  // Show loading state during processing
  if (isProcessing) {
    return (
      <LoadingState
        operation="Building activity timeline"
        details={`Grouping ${files.length.toLocaleString()} files by date...`}
        progress={processProgress}
      />
    );
  }
  
  // Get date range
  const dateRange = useMemo(() => {
    const now = new Date();
    const start = new Date();
    
    if (timeRange === 'week') {
      start.setDate(now.getDate() - 7);
    } else if (timeRange === 'month') {
      start.setMonth(now.getMonth() - 1);
    } else {
      start.setFullYear(now.getFullYear() - 1);
    }
    
    return { start, end: now };
  }, [timeRange]);
  
  // Generate calendar data
  const calendarData = useMemo(() => {
    const data: Array<{ date: string; count: number; intensity: number }> = [];
    const { start, end } = dateRange;
    
    // Get max count for normalization
    let maxCount = 0;
    Object.values(activityByDate).forEach(activity => {
      const count = viewMode === 'created' ? activity.created.length : activity.modified.length;
      maxCount = Math.max(maxCount, count);
    });
    
    // Generate dates in range
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const activity = activityByDate[dateStr];
      const count = activity 
        ? (viewMode === 'created' ? activity.created.length : activity.modified.length)
        : 0;
      const intensity = maxCount > 0 ? count / maxCount : 0;
      
      data.push({ date: dateStr, count, intensity });
      current.setDate(current.getDate() + 1);
    }
    
    return data;
  }, [activityByDate, dateRange, viewMode]);
  
  // Get recent activity
  const recentActivity = useMemo(() => {
    const recent: FileItem[] = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    
    files.forEach(file => {
      const date = viewMode === 'created' ? file.createdTime : file.modifiedTime;
      if (date && new Date(date) >= cutoff) {
        recent.push(file);
      }
    });
    
    return recent.sort((a, b) => {
      const dateA = new Date((viewMode === 'created' ? a.createdTime : a.modifiedTime) || 0).getTime();
      const dateB = new Date((viewMode === 'created' ? b.createdTime : b.modifiedTime) || 0).getTime();
      return dateB - dateA;
    }).slice(0, 50);
  }, [files, viewMode]);
  
  const getIntensityColor = (intensity: number): string => {
    if (intensity === 0) return 'bg-gray-100';
    if (intensity < 0.2) return 'bg-green-200';
    if (intensity < 0.4) return 'bg-green-400';
    if (intensity < 0.6) return 'bg-green-600';
    if (intensity < 0.8) return 'bg-green-700';
    return 'bg-green-900';
  };
  
  return (
    <div className="flex flex-col h-full overflow-auto p-6 bg-gray-50">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
                <Calendar size={24} />
                Activity Timeline
              </h2>
              <p className="text-gray-600">
                Visualize file creation and modification patterns over time
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">View:</label>
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as 'created' | 'modified')}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value="modified">Modified</option>
                  <option value="created">Created</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Range:</label>
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value as 'week' | 'month' | 'year')}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value="week">Last Week</option>
                  <option value="month">Last Month</option>
                  <option value="year">Last Year</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        
        {/* Calendar Heatmap */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">
            Activity Heatmap ({viewMode === 'created' ? 'Created' : 'Modified'} files)
          </h3>
          <div className="overflow-x-auto">
            <div className="inline-grid grid-cols-7 gap-1 min-w-full">
              {calendarData.map(({ date, count, intensity }) => {
                const dateObj = new Date(date);
                const dayOfWeek = dateObj.getDay();
                const isToday = date === new Date().toISOString().split('T')[0];
                
                return (
                  <div
                    key={date}
                    className={`aspect-square rounded text-xs flex items-center justify-center relative ${
                      getIntensityColor(intensity)
                    } ${isToday ? 'ring-2 ring-blue-500' : ''} ${
                      intensity > 0 ? 'cursor-pointer hover:opacity-80' : ''
                    }`}
                    title={`${date}: ${count} files`}
                  >
                    {dayOfWeek === 0 && (
                      <span className="absolute -left-8 text-xs text-gray-600">
                        {dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {count > 0 && (
                      <span className="text-white font-medium">{count}</span>
                        )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 text-xs text-gray-600">
            <span>Less</span>
            <div className="flex gap-1">
              <div className="w-3 h-3 bg-gray-100 rounded" />
              <div className="w-3 h-3 bg-green-200 rounded" />
              <div className="w-3 h-3 bg-green-400 rounded" />
              <div className="w-3 h-3 bg-green-600 rounded" />
              <div className="w-3 h-3 bg-green-700 rounded" />
              <div className="w-3 h-3 bg-green-900 rounded" />
            </div>
            <span>More</span>
          </div>
        </div>
        
        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={20} />
            Recent Activity (Last 7 Days)
          </h3>
          <div className="space-y-2">
            {recentActivity.map((file) => {
              const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
              const date = viewMode === 'created' ? file.createdTime : file.modifiedTime;
              
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
                        {date && new Date(date).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-700">
                    {formatSize(file.calculatedSize || file.size || 0)}
                  </div>
                </div>
              );
            })}
            {recentActivity.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                No activity in the last 7 days
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
