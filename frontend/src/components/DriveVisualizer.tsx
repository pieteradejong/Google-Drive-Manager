/** Main Drive visualization component */
import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, LayoutGrid, List, AlertCircle, Zap, Database, Clock, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useQuickScan } from '../hooks/useQuickScan';
import { useFullScan } from '../hooks/useFullScan';
import { useVisualizationStore } from '../stores/visualizationStore';
import { ListView } from './ListView';
import { api } from '../api/client';
import { useQueryClient } from '@tanstack/react-query';
import type { FileItem, ScanResponse } from '../types/drive';
import type { ExperimentType } from '../stores/visualizationStore';

// Lazy load experiment components to reduce initial bundle size
import { lazy, Suspense } from 'react';

const FolderFirstView = lazy(() => import('./experiments/FolderFirstView').then(m => ({ default: m.FolderFirstView })));
const SidebarTreeView = lazy(() => import('./experiments/SidebarTreeView').then(m => ({ default: m.SidebarTreeView })));
const BreadcrumbView = lazy(() => import('./experiments/BreadcrumbView').then(m => ({ default: m.BreadcrumbView })));
const SizeGridView = lazy(() => import('./experiments/SizeGridView').then(m => ({ default: m.SizeGridView })));
const TimelineView = lazy(() => import('./experiments/TimelineView').then(m => ({ default: m.TimelineView })));
const TypeGroupedView = lazy(() => import('./experiments/TypeGroupedView').then(m => ({ default: m.TypeGroupedView })));
const SearchFirstView = lazy(() => import('./experiments/SearchFirstView').then(m => ({ default: m.SearchFirstView })));
const CardFolderView = lazy(() => import('./experiments/CardFolderView').then(m => ({ default: m.CardFolderView })));
const StorageDashboardView = lazy(() => import('./experiments/StorageDashboardView').then(m => ({ default: m.StorageDashboardView })));
const LargeFilesView = lazy(() => import('./experiments/LargeFilesView').then(m => ({ default: m.LargeFilesView })));
const DuplicateFinderView = lazy(() => import('./experiments/DuplicateFinderView').then(m => ({ default: m.DuplicateFinderView })));
const FileAgeAnalysisView = lazy(() => import('./experiments/FileAgeAnalysisView').then(m => ({ default: m.FileAgeAnalysisView })));
const FolderDepthView = lazy(() => import('./experiments/FolderDepthView').then(m => ({ default: m.FolderDepthView })));
const ActivityTimelineView = lazy(() => import('./experiments/ActivityTimelineView').then(m => ({ default: m.ActivityTimelineView })));
const SharedFilesView = lazy(() => import('./experiments/SharedFilesView').then(m => ({ default: m.SharedFilesView })));
const OrphanedFilesView = lazy(() => import('./experiments/OrphanedFilesView').then(m => ({ default: m.OrphanedFilesView })));

const formatSize = (bytes: number | string | undefined): string => {
  if (!bytes) return '0 B';
  const numBytes = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(numBytes)) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = numBytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

// Experiment feedback component
const ExperimentFeedback = ({ experiment }: { experiment: ExperimentType }) => {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  
  const handleFeedback = (type: 'up' | 'down') => {
    setFeedback(type);
    // Could send to analytics/backend here
    console.log(`Experiment feedback: ${experiment} - ${type}`);
  };
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Helpful?</span>
      <button
        onClick={() => handleFeedback('up')}
        className={`p-1 rounded ${
          feedback === 'up' 
            ? 'bg-green-100 text-green-700' 
            : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
        }`}
        title="This works well"
      >
        <ThumbsUp size={16} />
      </button>
      <button
        onClick={() => handleFeedback('down')}
        className={`p-1 rounded ${
          feedback === 'down' 
            ? 'bg-red-100 text-red-700' 
            : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
        }`}
        title="This doesn't work well"
      >
        <ThumbsDown size={16} />
      </button>
    </div>
  );
};

export const DriveVisualizer = () => {
  const { 
    currentExperiment, 
    setCurrentExperiment, 
    currentFolderId, 
    setCurrentFolderId 
  } = useVisualizationStore();
  const { data: quickData, isLoading: quickLoading, error: quickError, scan: quickScan, dataUpdatedAt: quickDataUpdatedAt } = useQuickScan();
  const { progress: fullProgress, result: fullResult, isLoading: fullLoading, error: fullError, startScan: startFullScan, dataUpdatedAt: fullDataUpdatedAt } = useFullScan();
  
  const [displayData, setDisplayData] = useState<ScanResponse | null>(null);
  
  // Try to load cached full scan on mount
  useEffect(() => {
    if (!fullResult && !fullLoading) {
      // Try to start a scan - if backend has valid cache, it returns immediately
      startFullScan().catch(() => {
        // Ignore errors - just means no cache available
      });
    }
  }, []); // Only run on mount

  // Update display data when we have results (including cached data on load)
  useEffect(() => {
    if (fullResult) {
      setDisplayData(fullResult);
    } else if (quickData) {
      // Show quick scan results (top folders only)
      // Convert QuickScanResponse to ScanResponse format for display
      const quickResponse: ScanResponse = {
        files: quickData.top_folders,
        children_map: {},
        stats: {
          total_files: quickData.top_folders.length,
          total_size: quickData.top_folders.reduce((sum, f) => sum + (f.calculatedSize || 0), 0),
          folder_count: quickData.top_folders.length,
          file_count: 0
        }
      };
      setDisplayData(quickResponse);
    }
  }, [quickData, fullResult]);
  
  // Show notice if data was loaded from cache
  const isCachedData = (quickData && quickDataUpdatedAt && Date.now() - quickDataUpdatedAt > 60000) ||
                       (fullResult && fullDataUpdatedAt && Date.now() - fullDataUpdatedAt > 60000);

  const handleQuickScan = async () => {
    try {
      await quickScan();
    } catch (err) {
      // Error handled by hook
    }
  };

  const handleFullScan = async () => {
    try {
      await startFullScan();
    } catch (err) {
      // Error handled by hook
    }
  };

  const handleFileClick = (file: FileItem) => {
    if (file.webViewLink) {
      window.open(file.webViewLink, '_blank');
    }
  };

  const error = quickError || fullError;
  const isLoading = quickLoading || fullLoading;
  
  // Detect if we're displaying quick scan data (not full scan)
  const isQuickScanData = quickData && !fullResult && displayData;

  const queryClient = useQueryClient();

  const handleRefreshCache = async (scanType?: 'quick_scan' | 'full_scan') => {
    try {
      await api.invalidateCache(scanType);
      // Invalidate TanStack Query cache
      if (scanType === 'quick_scan') {
        queryClient.invalidateQueries({ queryKey: ['quickScan'] });
      } else if (scanType === 'full_scan') {
        queryClient.invalidateQueries({ queryKey: ['fullScan'] });
      } else {
        queryClient.invalidateQueries();
      }
    } catch (err) {
      console.error('Error invalidating cache:', err);
    }
  };

  const formatTimeAgo = (timestamp: number | undefined): string => {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const renderExperiment = (data: ScanResponse) => {
    const commonProps = {
      files: data.files,
      childrenMap: data.children_map,
      onFileClick: handleFileClick,
    };

    const LoadingFallback = () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );

    let ExperimentComponent: React.ComponentType<any> | null = null;
    let experimentProps = commonProps;

    switch (currentExperiment) {
      case 'folder-first':
        ExperimentComponent = FolderFirstView;
        break;
      case 'sidebar-tree':
        ExperimentComponent = SidebarTreeView;
        break;
      case 'breadcrumb':
        ExperimentComponent = BreadcrumbView;
        experimentProps = { ...commonProps, currentFolderId, onFolderSelect: setCurrentFolderId };
        break;
      case 'size-grid':
        ExperimentComponent = SizeGridView;
        break;
      case 'timeline':
        ExperimentComponent = TimelineView;
        break;
      case 'type-grouped':
        ExperimentComponent = TypeGroupedView;
        break;
      case 'search-first':
        ExperimentComponent = SearchFirstView;
        break;
      case 'card-view':
        ExperimentComponent = CardFolderView;
        experimentProps = { ...commonProps, currentFolderId, onFolderSelect: setCurrentFolderId };
        break;
      case 'storage-dashboard':
        ExperimentComponent = StorageDashboardView;
        experimentProps = { ...commonProps, stats: displayData?.overview, quotaInfo: displayData?.quota };
        break;
      case 'large-files':
        ExperimentComponent = LargeFilesView;
        break;
      case 'duplicate-finder':
        ExperimentComponent = DuplicateFinderView;
        break;
      case 'file-age':
        ExperimentComponent = FileAgeAnalysisView;
        break;
      case 'folder-depth':
        ExperimentComponent = FolderDepthView;
        break;
      case 'activity-timeline':
        ExperimentComponent = ActivityTimelineView;
        break;
      case 'shared-files':
        ExperimentComponent = SharedFilesView;
        break;
      case 'orphaned-files':
        ExperimentComponent = OrphanedFilesView;
        break;
      case 'list':
        return <ListView {...commonProps} />;
      default:
        ExperimentComponent = FolderFirstView;
    }

    if (ExperimentComponent) {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <ExperimentComponent {...experimentProps} />
        </Suspense>
      );
    }

    return null;
  };

  // Determine cache status for compact display
  const quickCacheAge = quickData && quickDataUpdatedAt ? Date.now() - quickDataUpdatedAt : 0;
  const fullCacheAge = fullResult && fullDataUpdatedAt ? Date.now() - fullDataUpdatedAt : 0;
  const showQuickCache = quickData && quickCacheAge > 60000;
  const showFullCache = fullResult && fullCacheAge > 60000;
  const hasAnyCache = showQuickCache || showFullCache;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Compact Cache Status Banner - Single line combining both */}
      {hasAnyCache && (
        <div className="bg-amber-50/80 border-b border-amber-200/50 px-4 py-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <Clock size={12} className="text-amber-600 flex-shrink-0" />
              <span className="text-amber-800">
                {showQuickCache && showFullCache ? (
                  <>Cached: Quick {formatTimeAgo(quickDataUpdatedAt)}, Full {formatTimeAgo(fullDataUpdatedAt)}</>
                ) : showFullCache ? (
                  <>Cached full scan from {formatTimeAgo(fullDataUpdatedAt)}</>
                ) : (
                  <>Cached data from {formatTimeAgo(quickDataUpdatedAt)}</>
                )}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {showQuickCache && (
                <button
                  onClick={() => handleRefreshCache('quick_scan')}
                  className="text-amber-700 hover:text-amber-900 underline text-xs whitespace-nowrap"
                >
                  Refresh quick
                </button>
              )}
              {showFullCache && (
                <button
                  onClick={handleFullScan}
                  className="text-amber-700 hover:text-amber-900 underline text-xs whitespace-nowrap"
                >
                  Refresh full
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Google Drive Manager</h1>
            <p className="text-sm text-gray-600 mt-1">Visualize and manage your Drive storage</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Quick Scan Button */}
            <div className="flex flex-col">
              <button
                onClick={handleQuickScan}
                disabled={quickLoading || fullLoading}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {quickLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Quick Scanning...</span>
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    <span>Quick Scan</span>
                  </>
                )}
              </button>
              <p className="text-xs text-gray-500 mt-1 text-center max-w-[140px]">
                {quickLoading 
                  ? "Fetching overview..." 
                  : quickData 
                    ? "✓ Completed" 
                    : "Get storage overview & top folders (5-10 sec)"}
              </p>
            </div>

            {/* Full Scan Button */}
            <div className="flex flex-col">
              <button
                onClick={handleFullScan}
                disabled={!quickData || fullLoading || fullProgress?.status === 'running'}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {fullLoading || fullProgress?.status === 'running' ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Scanning...</span>
                  </>
                ) : (
                  <>
                    <Database size={18} />
                    <span>Full Scan</span>
                  </>
                )}
              </button>
              <p className="text-xs text-gray-500 mt-1 text-center max-w-[140px]">
                {!quickData 
                  ? "Complete scan of all files (requires quick scan first)"
                  : fullProgress?.status === 'running'
                    ? `Scanning... ${Math.round(fullProgress.progress.progress)}%`
                    : fullResult
                      ? "✓ Completed"
                      : "Scan all files & calculate sizes (2-5 min)"}
              </p>
            </div>

            {/* Rescan Button - Only show after full scan completes */}
            {fullResult && (
              <div className="flex flex-col">
                <button
                  onClick={handleQuickScan}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <RefreshCw size={18} />
                  <span>Rescan</span>
                </button>
                <p className="text-xs text-gray-500 mt-1 text-center max-w-[140px]">
                  Start over with quick scan
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Quick Scan Overview */}
      {quickData && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              {quickData.overview.used && quickData.overview.total_quota && (
                <div>
                  <span className="text-gray-600">Storage Used: </span>
                  <span className="font-semibold text-gray-900">
                    {formatSize(parseInt(quickData.overview.used))} / {formatSize(parseInt(quickData.overview.total_quota))}
                  </span>
                </div>
              )}
              <div>
                <span className="text-gray-600">Top Folders: </span>
                <span className="font-semibold text-gray-900">{quickData.top_folders.length}</span>
              </div>
              {quickData.estimated_total_files && (
                <div>
                  <span className="text-gray-600">Estimated Total Files: </span>
                  <span className="font-semibold text-gray-900">~{quickData.estimated_total_files.toLocaleString()}+</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {quickDataUpdatedAt && (
                <div className="flex items-center gap-1 text-xs">
                  <Clock size={14} />
                  <span className={quickDataUpdatedAt && Date.now() - quickDataUpdatedAt > 3600000 ? 'text-amber-600 font-medium' : 'text-gray-600'}>
                    {Date.now() - quickDataUpdatedAt < 60000 
                      ? 'Just loaded' 
                      : `Updated ${formatTimeAgo(quickDataUpdatedAt)}`}
                    {Date.now() - quickDataUpdatedAt > 3600000 && ' (cached)'}
                  </span>
                </div>
              )}
              <button
                onClick={() => handleRefreshCache('quick_scan')}
                className="flex items-center gap-1 px-2 py-1 text-xs text-blue-700 hover:text-blue-900 hover:bg-blue-100 rounded transition-colors"
                title="Refresh cache"
              >
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Scan Progress */}
      {fullProgress && fullProgress.status === 'running' && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-4">
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-900">
                {fullProgress.progress.stage === 'fetching' && 'Fetching files...'}
                {fullProgress.progress.stage === 'building_tree' && 'Building folder structure...'}
                {fullProgress.progress.stage === 'calculating_sizes' && 'Calculating folder sizes...'}
              </span>
              <span className="text-sm text-gray-600">{Math.round(fullProgress.progress.progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div
                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${fullProgress.progress.progress}%` }}
              />
            </div>
            <div className="text-xs text-gray-600">
              {fullProgress.progress.message}
              {fullProgress.progress.current_page && fullProgress.progress.estimated_pages && (
                <span> • Page {fullProgress.progress.current_page} of ~{fullProgress.progress.estimated_pages}</span>
              )}
              {fullProgress.progress.files_fetched && (
                <span> • {fullProgress.progress.files_fetched.toLocaleString()} files fetched</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar - Only show for full scan results */}
      {displayData && fullResult && (
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-gray-600">Total Files: </span>
                <span className="font-semibold text-gray-900">{displayData.stats.total_files}</span>
              </div>
              <div>
                <span className="text-gray-600">Total Size: </span>
                <span className="font-semibold text-gray-900">
                  {formatSize(displayData.stats.total_size)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Folders: </span>
                <span className="font-semibold text-gray-900">{displayData.stats.folder_count}</span>
              </div>
              <div>
                <span className="text-gray-600">Files: </span>
                <span className="font-semibold text-gray-900">{displayData.stats.file_count}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {fullDataUpdatedAt && (
                <div className="flex items-center gap-1 text-xs">
                  <Clock size={14} />
                  <span className={fullDataUpdatedAt && Date.now() - fullDataUpdatedAt > 604800000 ? 'text-amber-600 font-medium' : 'text-gray-600'}>
                    {Date.now() - fullDataUpdatedAt < 60000 
                      ? 'Just loaded' 
                      : `Updated ${formatTimeAgo(fullDataUpdatedAt)}`}
                    {Date.now() - fullDataUpdatedAt > 604800000 && ' (cached)'}
                  </span>
                </div>
              )}
              <button
                onClick={() => handleRefreshCache('full_scan')}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                title="Refresh cache"
              >
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Experiment Selector - Only show for full scan results */}
      {displayData && !isQuickScanData && (
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700 mr-2">View:</span>
              <select
                value={currentExperiment}
                onChange={(e) => setCurrentExperiment(e.target.value as ExperimentType)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <optgroup label="Navigation">
                  <option value="folder-first">Folder First</option>
                  <option value="sidebar-tree">Sidebar Tree</option>
                  <option value="breadcrumb">Breadcrumb</option>
                  <option value="card-view">Card View</option>
                </optgroup>
                <optgroup label="Analysis & Insights">
                  <option value="storage-dashboard">Storage Dashboard</option>
                  <option value="large-files">Large Files Finder</option>
                  <option value="duplicate-finder">Duplicate Finder</option>
                  <option value="file-age">File Age Analysis</option>
                  <option value="folder-depth">Folder Depth Analysis</option>
                  <option value="activity-timeline">Activity Timeline</option>
                  <option value="shared-files">Shared Files</option>
                  <option value="orphaned-files">Orphaned Files</option>
                </optgroup>
                <optgroup label="Visualizations">
                  <option value="size-grid">Size Grid</option>
                  <option value="timeline">Timeline</option>
                  <option value="type-grouped">Type Grouped</option>
                  <option value="search-first">Search First</option>
                  <option value="list">List</option>
                </optgroup>
              </select>
            </div>
            <ExperimentFeedback experiment={currentExperiment} />
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-2xl">
            <div className="flex items-start gap-4">
              <AlertCircle className="text-red-600 flex-shrink-0" size={24} />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 text-lg mb-2">Error scanning Drive</h3>
                <p className="text-sm text-red-700 mb-3">
                  {error instanceof Error 
                    ? (error as any).response?.data?.detail || error.message
                    : 'An unknown error occurred'}
                </p>
                {(error instanceof Error && 
                  (error as any).response?.data?.detail?.includes('credentials.json')) && (
                  <div className="mt-4 p-3 bg-red-100 rounded border border-red-300">
                    <p className="text-sm text-red-800 font-medium mb-2">Setup Required:</p>
                    <ol className="text-sm text-red-700 list-decimal list-inside space-y-1">
                      <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a></li>
                      <li>Create OAuth 2.0 credentials (Desktop app)</li>
                      <li>Download as <code className="bg-red-200 px-1 rounded">credentials.json</code></li>
                      <li>Place it in the project root directory</li>
                    </ol>
                    <p className="text-xs text-red-600 mt-2">See SETUP.md for detailed instructions</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !displayData && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin mx-auto text-primary-600" size={48} />
            <p className="mt-4 text-gray-600">Scanning your Google Drive...</p>
            <p className="mt-2 text-sm text-gray-500">This may take a few moments</p>
          </div>
        </div>
      )}

      {/* Quick Scan Placeholder */}
      {isQuickScanData && (
        <div className="flex-1 flex items-center justify-center bg-blue-50">
          <div className="text-center max-w-2xl px-6">
            <Database className="mx-auto text-blue-500" size={64} />
            <h3 className="mt-6 text-2xl font-semibold text-gray-900">Quick Scan Complete</h3>
            <p className="mt-4 text-gray-600">
              Quick scan provides an overview of your Drive storage and identifies top-level folders.
              <br />
              <span className="font-medium">To see the complete visualization with all files and folder sizes, run a Full Scan.</span>
            </p>
            <div className="mt-6 bg-white rounded-lg border border-blue-200 p-4 text-left">
              <p className="text-sm font-medium text-gray-900 mb-2">What Quick Scan shows:</p>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>Storage quota and usage</li>
                <li>Number of top-level folders</li>
                <li>Estimated total file count</li>
              </ul>
              <p className="text-sm font-medium text-gray-900 mt-4 mb-2">What Full Scan provides:</p>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>Complete file and folder hierarchy</li>
                <li>Accurate folder sizes (calculated recursively)</li>
                <li>Interactive treemap and list visualizations</li>
                <li>Detailed file metadata</li>
              </ul>
            </div>
            <button
              onClick={handleFullScan}
              disabled={fullLoading || fullProgress?.status === 'running'}
              className="mt-6 flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mx-auto"
            >
              {fullLoading || fullProgress?.status === 'running' ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span>Starting Full Scan...</span>
                </>
              ) : (
                <>
                  <Database size={20} />
                  <span>Run Full Scan</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Visualization Experiments - Only show for full scan results */}
      {displayData && !isLoading && !isQuickScanData && (
        <div className="flex-1 overflow-hidden">
          {renderExperiment(displayData)}
        </div>
      )}

      {/* Empty State */}
      {!displayData && !isLoading && !error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <LayoutGrid className="mx-auto text-gray-400" size={64} />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">No data loaded</h3>
            <p className="mt-2 text-gray-600">Click "Quick Scan" to get started</p>
            <p className="mt-1 text-sm text-gray-500">
              <strong>Quick Scan</strong> shows storage overview and top-level folders in 5-10 seconds.
              <br />
              <strong>Full Scan</strong> analyzes all files and calculates folder sizes (2-5 minutes).
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
