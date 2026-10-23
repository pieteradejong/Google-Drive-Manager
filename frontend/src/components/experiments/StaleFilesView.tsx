/** Stale Files Cleanup Mode — finds untouched, large-old, and duplicate-named items */
import { useState, useMemo } from 'react';
import { File, Folder, ExternalLink, Clock, HardDrive, Copy } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import { measureSync } from '../../utils/performance';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface StaleFilesViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

type Tab = 'untouched' | 'large-old' | 'duplicate-folders';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

// Strip trailing copy suffixes to find "base name" of a folder
// Handles: "Folder (1)", "Folder (2)", "Folder copy", "Folder - Copy"
function folderBaseName(name: string): string {
  return name
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\s*-?\s*copy\s*\d*\s*$/i, '')
    .replace(/\s+\d+\s*$/, '')
    .trim()
    .toLowerCase();
}

function ageLabel(days: number): string {
  if (days >= 365 * 3) return `${Math.floor(days / 365)}y old`;
  if (days >= 365) return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}mo old`;
  if (days >= 30) return `${Math.floor(days / 30)}mo old`;
  return `${days}d old`;
}

function ageDays(modifiedTime: string | undefined | null): number {
  if (!modifiedTime) return 0;
  return Math.floor((Date.now() - new Date(modifiedTime).getTime()) / 86_400_000);
}

export const StaleFilesView = ({ files, onFileClick }: StaleFilesViewProps) => {
  const [tab, setTab] = useState<Tab>('untouched');
  const [untouchedYears, setUntouchedYears] = useState(2);
  const [untouchedMinSizeMB, setUntouchedMinSizeMB] = useState(0);
  const [largeOldMinSizeMB, setLargeOldMinSizeMB] = useState(100);
  const [largeOldYears, setLargeOldYears] = useState(3);
  const [isProcessing, setIsProcessing] = useState(true);

  const computed = useMemo(() => {
    setIsProcessing(true);

    const result = measureSync('StaleFilesView: compute', () => {
      const now = Date.now();
      const msPerYear = 365 * 24 * 60 * 60 * 1000;

      // --- Tab 1: Long Untouched ---
      const untouchedThresholdMs = untouchedYears * msPerYear;
      const untouchedMinSizeBytes = untouchedMinSizeMB * 1024 * 1024;

      const untouched = files
        .filter(f => {
          if (f.mimeType === FOLDER_MIME) return false;
          if (f.mimeType === SHORTCUT_MIME) return false;
          if ((f as any).starred) return false;
          const size = f.calculatedSize ?? f.size ?? 0;
          if (size < untouchedMinSizeBytes) return false;
          if (!f.modifiedTime) return false;
          return now - new Date(f.modifiedTime).getTime() >= untouchedThresholdMs;
        })
        .sort((a, b) => {
          const sa = a.calculatedSize ?? a.size ?? 0;
          const sb = b.calculatedSize ?? b.size ?? 0;
          return sb - sa;
        })
        .slice(0, 2000);

      const untouchedTotalSize = untouched.reduce(
        (s, f) => s + (f.calculatedSize ?? f.size ?? 0), 0
      );

      // --- Tab 2: Large & Old ---
      const largeOldThresholdMs = largeOldYears * msPerYear;
      const largeOldMinSizeBytes = largeOldMinSizeMB * 1024 * 1024;

      const largeOld = files
        .filter(f => {
          if (f.mimeType === FOLDER_MIME) return false;
          if (f.mimeType === SHORTCUT_MIME) return false;
          const size = f.calculatedSize ?? f.size ?? 0;
          if (size < largeOldMinSizeBytes) return false;
          if (!f.modifiedTime) return false;
          return now - new Date(f.modifiedTime).getTime() >= largeOldThresholdMs;
        })
        .sort((a, b) => {
          const sa = a.calculatedSize ?? a.size ?? 0;
          const sb = b.calculatedSize ?? b.size ?? 0;
          return sb - sa;
        })
        .slice(0, 500);

      const largeOldTotalSize = largeOld.reduce(
        (s, f) => s + (f.calculatedSize ?? f.size ?? 0), 0
      );

      // --- Tab 3: Duplicate-Named Folders ---
      const folders = files.filter(f => f.mimeType === FOLDER_MIME);
      const groups: Record<string, FileItem[]> = {};
      for (const folder of folders) {
        const base = folderBaseName(folder.name);
        if (!base) continue;
        if (!groups[base]) groups[base] = [];
        groups[base].push(folder);
      }

      const dupeFolderGroups = Object.entries(groups)
        .filter(([, group]) => group.length > 1)
        .map(([base, group]) => ({
          base,
          folders: group.sort((a, b) => a.name.localeCompare(b.name)),
          totalSize: group.reduce((s, f) => s + (f.calculatedSize ?? f.size ?? 0), 0),
        }))
        .sort((a, b) => b.totalSize - a.totalSize)
        .slice(0, 200);

      return { untouched, untouchedTotalSize, largeOld, largeOldTotalSize, dupeFolderGroups };
    }, 500);

    setTimeout(() => setIsProcessing(false), 100);
    return result;
  }, [files, untouchedYears, untouchedMinSizeMB, largeOldMinSizeMB, largeOldYears]);

  if (isProcessing) {
    return (
      <LoadingState
        operation="Scanning for stale files"
        details={`Analyzing ${files.length.toLocaleString()} files...`}
        progress={100}
      />
    );
  }

  const { untouched, untouchedTotalSize, largeOld, largeOldTotalSize, dupeFolderGroups } = computed;

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-blue-600 text-blue-700'
        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
    }`;

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-0">
          <button className={tabClass('untouched')} onClick={() => setTab('untouched')}>
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              Long Untouched
              <span className="ml-1 bg-amber-100 text-amber-800 text-xs px-1.5 py-0.5 rounded-full">
                {untouched.length.toLocaleString()}
              </span>
            </span>
          </button>
          <button className={tabClass('large-old')} onClick={() => setTab('large-old')}>
            <span className="flex items-center gap-1.5">
              <HardDrive size={14} />
              Large &amp; Old
              <span className="ml-1 bg-red-100 text-red-800 text-xs px-1.5 py-0.5 rounded-full">
                {largeOld.length.toLocaleString()}
              </span>
            </span>
          </button>
          <button className={tabClass('duplicate-folders')} onClick={() => setTab('duplicate-folders')}>
            <span className="flex items-center gap-1.5">
              <Copy size={14} />
              Duplicate-Named Folders
              <span className="ml-1 bg-purple-100 text-purple-800 text-xs px-1.5 py-0.5 rounded-full">
                {dupeFolderGroups.length.toLocaleString()}
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* Tab: Long Untouched */}
      {tab === 'untouched' && (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Untouched for:</label>
              <select
                value={untouchedYears}
                onChange={e => setUntouchedYears(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value={1}>1+ year</option>
                <option value={2}>2+ years</option>
                <option value={3}>3+ years</option>
                <option value={5}>5+ years</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Min size (MB):</label>
              <input
                type="number"
                min={0}
                step={1}
                value={untouchedMinSizeMB}
                onChange={e => setUntouchedMinSizeMB(Number(e.target.value) || 0)}
                className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="text-sm text-gray-600">
              {untouched.length.toLocaleString()} files &mdash;&nbsp;
              <span className="font-semibold text-amber-700">{formatSize(untouchedTotalSize)} total</span>
            </div>
            <div className="text-xs text-gray-400 ml-auto">Starred files are excluded</div>
          </div>
          <FileTable files={untouched} onFileClick={onFileClick} />
        </div>
      )}

      {/* Tab: Large & Old */}
      {tab === 'large-old' && (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Larger than:</label>
              <select
                value={largeOldMinSizeMB}
                onChange={e => setLargeOldMinSizeMB(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value={10}>10 MB</option>
                <option value={50}>50 MB</option>
                <option value={100}>100 MB</option>
                <option value={500}>500 MB</option>
                <option value={1024}>1 GB</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Untouched for:</label>
              <select
                value={largeOldYears}
                onChange={e => setLargeOldYears(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value={1}>1+ year</option>
                <option value={2}>2+ years</option>
                <option value={3}>3+ years</option>
                <option value={5}>5+ years</option>
              </select>
            </div>
            <div className="text-sm text-gray-600">
              {largeOld.length.toLocaleString()} files &mdash;&nbsp;
              <span className="font-semibold text-red-700">{formatSize(largeOldTotalSize)} total</span>
            </div>
          </div>
          <FileTable files={largeOld} onFileClick={onFileClick} />
        </div>
      )}

      {/* Tab: Duplicate-Named Folders */}
      {tab === 'duplicate-folders' && (
        <div className="flex-1 overflow-auto">
          {dupeFolderGroups.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
              No duplicate-named folders found
            </div>
          ) : (
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                Folders whose names look like copies of each other (e.g. "Photos 2019" and "Photos 2019 (1)").
                These may be accidental duplicates — verify before deleting.
              </p>
              {dupeFolderGroups.map(({ base, folders, totalSize }) => (
                <div key={base} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-purple-50 px-4 py-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-purple-900 capitalize">{base}</span>
                    <div className="flex items-center gap-3 text-xs text-purple-700">
                      <span>{folders.length} folders</span>
                      <span className="font-semibold">{formatSize(totalSize)} combined</span>
                    </div>
                  </div>
                  <table className="w-full">
                    <tbody>
                      {folders.map(folder => {
                        const days = ageDays(folder.modifiedTime);
                        return (
                          <tr
                            key={folder.id}
                            className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                            onClick={() => onFileClick?.(folder)}
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <Folder size={16} className="text-blue-400 flex-shrink-0" />
                                <span className="text-sm font-medium">{folder.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-600 w-28 text-right">
                              {formatSize(folder.calculatedSize ?? folder.size ?? 0)}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-400 w-32 text-right">
                              {days > 0 ? ageLabel(days) : '—'}
                            </td>
                            {folder.webViewLink && (
                              <td className="px-3 py-2.5 w-8">
                                <a
                                  href={folder.webViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-gray-400 hover:text-blue-600"
                                >
                                  <ExternalLink size={14} />
                                </a>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Shared table for untouched / large-old tabs
interface FileTableProps {
  files: FileItem[];
  onFileClick?: (file: FileItem) => void;
}

const FileTable = ({ files, onFileClick }: FileTableProps) => {
  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No files match your filters
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse">
        <thead className="bg-gray-100 sticky top-0">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 w-28">Size</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 w-36">Last Modified</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 w-24">Age</th>
            <th className="px-4 py-3 w-8" />
          </tr>
        </thead>
        <tbody>
          {files.map(file => {
            const size = file.calculatedSize ?? file.size ?? 0;
            const days = ageDays(file.modifiedTime);
            const modifiedStr = file.modifiedTime
              ? new Date(file.modifiedTime).toLocaleDateString()
              : '—';
            return (
              <tr
                key={file.id}
                className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                onClick={() => onFileClick?.(file)}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <File size={16} className="text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-sm font-semibold text-right">{formatSize(size)}</td>
                <td className="px-4 py-2.5 text-sm text-gray-600">{modifiedStr}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    days >= 365 * 5
                      ? 'bg-red-100 text-red-800'
                      : days >= 365 * 3
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-amber-100 text-amber-800'
                  }`}>
                    {ageLabel(days)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {file.webViewLink && (
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-gray-400 hover:text-blue-600"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {files.length >= 2000 && (
        <div className="px-4 py-2 text-sm text-gray-500 text-center bg-gray-50">
          Showing first 2,000 results. Narrow your filters to see fewer items.
        </div>
      )}
    </div>
  );
};
