/** Shared With Me - Files owned by others (ownedByMe = false) */
import { useMemo } from 'react';
import { Users, File, Folder, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

interface SharedWithMeViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

interface OwnerGroup {
  ownerEmail: string;
  ownerName: string;
  files: FileItem[];
  totalSize: number;
}

export const SharedWithMeView = ({ files, onFileClick }: SharedWithMeViewProps) => {
  // Find files where ownedByMe = false (shared with me)
  const sharedWithMeFiles = useMemo(() => {
    return files.filter(file => file.ownedByMe === false);
  }, [files]);

  // Group by owner
  const ownerGroups = useMemo(() => {
    const groups = new Map<string, OwnerGroup>();

    sharedWithMeFiles.forEach(file => {
      // Get owner info from file (if available)
      const owner = (file as any).owners?.[0];
      const ownerEmail = owner?.emailAddress || 'unknown';
      const ownerName = owner?.displayName || ownerEmail;

      if (!groups.has(ownerEmail)) {
        groups.set(ownerEmail, {
          ownerEmail,
          ownerName,
          files: [],
          totalSize: 0,
        });
      }

      const group = groups.get(ownerEmail)!;
      group.files.push(file);
      group.totalSize += file.calculatedSize || file.size || 0;
    });

    // Sort by total size descending
    return Array.from(groups.values()).sort((a, b) => b.totalSize - a.totalSize);
  }, [sharedWithMeFiles]);

  // Stats
  const totalSize = useMemo(() => {
    return sharedWithMeFiles.reduce((sum, f) => sum + (f.calculatedSize || f.size || 0), 0);
  }, [sharedWithMeFiles]);

  const folderCount = useMemo(() => {
    return sharedWithMeFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length;
  }, [sharedWithMeFiles]);

  const fileCount = sharedWithMeFiles.length - folderCount;

  return (
    <div className="flex flex-col h-full overflow-auto p-6 bg-gray-50">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Header Stats */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users size={24} className="text-purple-500" />
            <div>
              <h2 className="text-2xl font-semibold">Shared With Me</h2>
              <p className="text-gray-600 text-sm mt-1">
                Files and folders owned by others that have been shared with you
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Total Shared Items</div>
              <div className="text-2xl font-bold">{sharedWithMeFiles.length.toLocaleString()}</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Shared Folders</div>
              <div className="text-2xl font-bold">{folderCount.toLocaleString()}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Shared Files</div>
              <div className="text-2xl font-bold">{fileCount.toLocaleString()}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Total Size</div>
              <div className="text-2xl font-bold">{formatSize(totalSize)}</div>
            </div>
          </div>

          {/* Info about shared files */}
          <div className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex items-start gap-2">
              <ShieldAlert size={18} className="text-purple-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-purple-800">
                <strong>Note:</strong> These files don't count against your storage quota, but you may have 
                limited control over them. The owner can revoke access at any time.
              </div>
            </div>
          </div>
        </div>

        {/* Owners Summary */}
        {ownerGroups.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">By Owner ({ownerGroups.length} owners)</h3>
            <div className="space-y-2">
              {ownerGroups.slice(0, 10).map(group => (
                <div key={group.ownerEmail} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                      <span className="text-purple-700 font-medium text-sm">
                        {group.ownerName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-sm">{group.ownerName}</div>
                      {group.ownerName !== group.ownerEmail && (
                        <div className="text-xs text-gray-500">{group.ownerEmail}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-sm">{group.files.length} items</div>
                    <div className="text-xs text-gray-500">{formatSize(group.totalSize)}</div>
                  </div>
                </div>
              ))}
              {ownerGroups.length > 10 && (
                <div className="text-sm text-gray-500 text-center py-2">
                  +{ownerGroups.length - 10} more owners
                </div>
              )}
            </div>
          </div>
        )}

        {/* File List */}
        {sharedWithMeFiles.length > 0 ? (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">
              All Shared Items ({sharedWithMeFiles.length.toLocaleString()})
            </h3>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {sharedWithMeFiles
                .sort((a, b) => (b.calculatedSize || b.size || 0) - (a.calculatedSize || a.size || 0))
                .slice(0, 200)
                .map(file => {
                  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                  const owner = (file as any).owners?.[0];

                  return (
                    <div
                      key={file.id}
                      onClick={() => onFileClick?.(file)}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {isFolder ? (
                          <Folder size={20} className="text-purple-500 flex-shrink-0" />
                        ) : (
                          <File size={20} className="text-gray-400 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{file.name}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Users size={12} />
                              {owner?.displayName || owner?.emailAddress || 'Unknown owner'}
                            </span>
                            {file.modifiedTime && (
                              <span>Modified {new Date(file.modifiedTime).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <OwnershipBadge file={file} />
                        <div className="text-sm font-semibold text-gray-700 w-20 text-right">
                          {formatSize(file.calculatedSize || file.size || 0)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              {sharedWithMeFiles.length > 200 && (
                <div className="text-sm text-gray-500 text-center py-4">
                  Showing 200 of {sharedWithMeFiles.length.toLocaleString()} items
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Users size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium text-gray-700 mb-2">No Shared Files Found</p>
            <p className="text-sm text-gray-500">
              Files shared with you by others will appear here
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

/** Badge showing access level based on capabilities */
const OwnershipBadge = ({ file }: { file: FileItem }) => {
  // Check capabilities if available
  const caps = (file as any).capabilities;
  
  if (!caps) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 flex items-center gap-1">
        <Shield size={12} />
        Shared
      </span>
    );
  }

  // Determine access level
  const canEdit = caps.canEdit || caps.canRename;
  const canDelete = caps.canDelete || caps.canTrash;

  if (canDelete) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 flex items-center gap-1">
        <ShieldCheck size={12} />
        Full access
      </span>
    );
  } else if (canEdit) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 flex items-center gap-1">
        <Shield size={12} />
        Can edit
      </span>
    );
  } else {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 flex items-center gap-1">
        <Shield size={12} />
        View only
      </span>
    );
  }
};
