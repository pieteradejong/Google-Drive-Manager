/** Main Drive visualization component */
import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, LayoutGrid, List, AlertCircle, Zap, Database } from 'lucide-react';
import { useQuickScan } from '../hooks/useQuickScan';
import { useFullScan } from '../hooks/useFullScan';
import { useVisualizationStore } from '../stores/visualizationStore';
import { TreemapView } from './TreemapView';
import { ListView } from './ListView';
import type { FileItem, ScanResponse } from '../types/drive';

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

export const DriveVisualizer = () => {
  const { viewMode, setViewMode } = useVisualizationStore();
  const { data: quickData, isLoading: quickLoading, error: quickError, scan: quickScan } = useQuickScan();
  const { progress: fullProgress, result: fullResult, isLoading: fullLoading, error: fullError, startScan: startFullScan } = useFullScan();
  
  const [displayData, setDisplayData] = useState<ScanResponse | null>(null);

  // Update display data when we have results
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

  return (
    <div className="flex flex-col h-screen bg-gray-50">
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
        </div>
      )}

      {/* View Toggle - Only show for full scan results */}
      {displayData && !isQuickScanData && (
        <div className="bg-white border-b border-gray-200 px-6 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('treemap')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'treemap'
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <LayoutGrid size={16} />
              Treemap
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <List size={16} />
              List
            </button>
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

      {/* Visualization - Only show for full scan results */}
      {displayData && !isLoading && !isQuickScanData && (
        <div className="flex-1 overflow-hidden">
          {viewMode === 'treemap' ? (
            <TreemapView
              files={displayData.files}
              childrenMap={displayData.children_map}
              onFileClick={handleFileClick}
            />
          ) : (
            <ListView
              files={displayData.files}
              childrenMap={displayData.children_map}
              onFileClick={handleFileClick}
            />
          )}
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

