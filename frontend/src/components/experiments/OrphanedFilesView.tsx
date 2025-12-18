/** Orphaned Files Detector - Find files with broken parent references */
import { useMemo, useState } from 'react';
import { AlertTriangle, File, Folder, Unlink } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import { measureSync } from '../../utils/performance';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface OrphanedFilesViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

export const OrphanedFilesView = ({ files, onFileClick }: OrphanedFilesViewProps) => {
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // Create a set of all valid file IDs
  const validFileIds = useMemo(() => {
    return new Set(files.map(f => f.id));
  }, [files]);
  
  // Find orphaned files (files whose parents don't exist)
  const orphanedFiles = useMemo(() => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    const result = measureSync('OrphanedFilesView: findOrphaned', () => {
      const orphans: FileItem[] = [];
      const totalFiles = files.length;
      let processed = 0;
      
      files.forEach(file => {
        // Files with no parents are root files, not orphans
        if (file.parents.length === 0) return;
        
        // Check if any parent doesn't exist
        if (file.parents.some(parentId => !validFileIds.has(parentId))) {
          orphans.push(file);
        }
        
        processed++;
        if (processed % 1000 === 0) {
          setAnalysisProgress(Math.min(90, (processed / totalFiles) * 90));
        }
      });
      
      return orphans;
    }, 500);
    
    setAnalysisProgress(100);
    setTimeout(() => {
      setIsAnalyzing(false);
    }, 200);
    
    return result;
  }, [files, validFileIds]);
  
  // Group orphaned files by missing parent count
  const orphanedByType = useMemo(() => {
    const folders: FileItem[] = [];
    const regularFiles: FileItem[] = [];
    
    orphanedFiles.forEach(file => {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        folders.push(file);
      } else {
        regularFiles.push(file);
      }
    });
    
    return { folders, regularFiles };
  }, [orphanedFiles]);
  
  // Get missing parent IDs for a file
  const getMissingParents = (file: FileItem): string[] => {
    return file.parents.filter(parentId => !validFileIds.has(parentId));
  };
  
  // Show loading state during analysis
  if (isAnalyzing) {
    return (
      <LoadingState
        operation="Finding orphaned files"
        details={`Validating parent references for ${files.length.toLocaleString()} files...`}
        progress={analysisProgress}
      />
    );
  }
  
  return (
    <div className="flex flex-col h-full overflow-auto p-6 bg-gray-50">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle size={24} className="text-amber-500" />
            <div>
              <h2 className="text-2xl font-semibold">Orphaned Files Detector</h2>
              <p className="text-gray-600 text-sm mt-1">
                Files with broken parent folder references
              </p>
            </div>
          </div>
          
          {orphanedFiles.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700">
                <span className="text-lg">✓</span>
                <span className="font-medium">No orphaned files found!</span>
              </div>
              <p className="text-sm text-green-600 mt-1">
                All files have valid parent folder references.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="text-sm text-red-600 mb-1">Total Orphaned</div>
                <div className="text-2xl font-bold text-red-700">{orphanedFiles.length}</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <div className="text-sm text-amber-600 mb-1">Orphaned Folders</div>
                <div className="text-2xl font-bold text-amber-700">{orphanedByType.folders.length}</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="text-sm text-orange-600 mb-1">Orphaned Files</div>
                <div className="text-2xl font-bold text-orange-700">{orphanedByType.regularFiles.length}</div>
              </div>
            </div>
          )}
        </div>
        
        {/* Orphaned Folders */}
        {orphanedByType.folders.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Folder size={20} className="text-blue-500" />
              Orphaned Folders ({orphanedByType.folders.length})
            </h3>
            <div className="space-y-2">
              {orphanedByType.folders.map((file) => {
                const missingParents = getMissingParents(file);
                return (
                  <div
                    key={file.id}
                    onClick={() => onFileClick?.(file)}
                    className="flex items-center justify-between p-3 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Folder size={20} className="text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{file.name}</div>
                        <div className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                          <Unlink size={12} />
                          <span>Missing parent{missingParents.length > 1 ? 's' : ''}: {missingParents.join(', ')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-gray-700 flex-shrink-0">
                      {formatSize(file.calculatedSize || file.size || 0)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Orphaned Files */}
        {orphanedByType.regularFiles.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <File size={20} className="text-gray-400" />
              Orphaned Files ({orphanedByType.regularFiles.length})
            </h3>
            <div className="space-y-2">
              {orphanedByType.regularFiles.map((file) => {
                const missingParents = getMissingParents(file);
                return (
                  <div
                    key={file.id}
                    onClick={() => onFileClick?.(file)}
                    className="flex items-center justify-between p-3 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <File size={20} className="text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{file.name}</div>
                        <div className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                          <Unlink size={12} />
                          <span>Missing parent{missingParents.length > 1 ? 's' : ''}: {missingParents.join(', ')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-gray-700 flex-shrink-0">
                      {formatSize(file.calculatedSize || file.size || 0)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {orphanedFiles.length === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Unlink size={48} className="mx-auto mb-4 text-green-500" />
            <p className="text-lg font-medium text-gray-700 mb-2">All Files Have Valid Parents</p>
            <p className="text-sm text-gray-500">
              No orphaned files detected. Your folder structure is intact!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
