/** Timeline/Chronological View - Organized by modified date (Enhanced with activity patterns) */
import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { File, Folder, Calendar } from 'lucide-react';
import { groupByDatePeriod, sortByDate, formatSize } from '../../utils/navigation';
import { measureSync } from '../../utils/performance';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface TimelineViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

export const TimelineView = ({ files, childrenMap, onFileClick }: TimelineViewProps) => {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [isProcessing, setIsProcessing] = useState(true);
  const [processProgress, setProcessProgress] = useState(0);
  
  // Memoize expensive grouping operation
  const groups = useMemo(() => {
    setIsProcessing(true);
    setProcessProgress(0);
    
    const result = measureSync('TimelineView: groupByDatePeriod', () => {
      return groupByDatePeriod(files, period);
    }, 500);
    
    setProcessProgress(50);
    
    setTimeout(() => {
      setIsProcessing(false);
    }, 200);
    
    return result;
  }, [files, period]);
  
  // Memoize sorted groups
  const sortedGroups = useMemo(() => {
    return Object.entries(groups)
      .map(([date, items]) => ({
        date,
        items: sortByDate(items),
        totalSize: items.reduce((sum, f) => sum + (f.calculatedSize || f.size || 0), 0)
      }))
      .sort((a, b) => {
        if (a.date === 'No date') return 1;
        if (b.date === 'No date') return -1;
        return b.date.localeCompare(a.date);
      });
  }, [groups]);
  
  // Show loading state during processing
  if (isProcessing) {
    return (
      <LoadingState
        operation="Grouping files by timeline"
        details={`Organizing ${files.length.toLocaleString()} files by ${period}...`}
        progress={processProgress}
      />
    );
  }
  
  const formatDateLabel = (dateStr: string): string => {
    if (dateStr === 'No date') return 'No date';
    try {
      const date = new Date(dateStr);
      if (period === 'day') {
        return format(date, 'MMM dd, yyyy');
      } else if (period === 'week') {
        const weekEnd = new Date(date);
        weekEnd.setDate(date.getDate() + 6);
        return `${format(date, 'MMM dd')} - ${format(weekEnd, 'MMM dd, yyyy')}`;
      } else {
        return format(date, 'MMMM yyyy');
      }
    } catch {
      return dateStr;
    }
  };
  
  return (
    <div className="flex flex-col h-full">
      {/* Period Selector */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-4">
        <span className="text-sm font-medium">Group by:</span>
        <div className="flex gap-2">
          {(['day', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-sm rounded ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Timeline */}
      <div className="flex-1 overflow-auto p-4">
        {sortedGroups.map(({ date, items, totalSize }) => (
          <div key={date} className="mb-6">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
              <h3 className="text-lg font-semibold">{formatDateLabel(date)}</h3>
              <div className="text-sm text-gray-600">
                {items.length} {items.length === 1 ? 'item' : 'items'} • {formatSize(totalSize)}
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Limit items per group to prevent DOM overload */}
              {items.slice(0, 500).map((item) => {
                const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                return (
                  <div
                    key={item.id}
                    onClick={() => onFileClick?.(item)}
                    className="flex items-center gap-2 p-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    {isFolder ? (
                      <Folder size={20} className="text-blue-500 flex-shrink-0" />
                    ) : (
                      <File size={20} className="text-gray-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      <div className="text-xs text-gray-500">
                        {item.modifiedTime && format(new Date(item.modifiedTime), 'MMM dd, yyyy HH:mm')}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 flex-shrink-0">
                      {formatSize(item.calculatedSize || item.size)}
                    </div>
                  </div>
                );
              })}
            </div>
            {items.length > 500 && (
              <div className="text-sm text-gray-500 mt-2">
                ... and {items.length - 500} more items (showing first 500)
              </div>
            )}
          </div>
        ))}
        
        {sortedGroups.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            No files found
          </div>
        )}
      </div>
    </div>
  );
};
