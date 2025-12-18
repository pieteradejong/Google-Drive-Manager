import { useEffect, useMemo, useState } from 'react';
import { Folder, File as FileIcon } from 'lucide-react';
import type { DagTabProps } from './types';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const TreeProjectionTab = ({
  dag,
  fileById,
  selectedRootIds,
  setSelectedRootIds,
  filters,
  setSelectedNodeId,
  onFileClick,
}: DagTabProps) => {
  const rootId = selectedRootIds[0] || dag.roots[0] || '';

  const [expanded, setExpanded] = useState<Set<string>>(new Set([rootId]));

  // Keep root selection stable if user switches roots
  const effectiveRootId = useMemo(() => {
    if (rootId && dag.nodesById.has(rootId)) return rootId;
    return dag.roots[0] || '';
  }, [rootId, dag.roots, dag.nodesById]);

  // Ensure the active root is expandable/visible after root changes.
  useEffect(() => {
    if (!effectiveRootId) return;
    setExpanded((prev) => {
      if (prev.has(effectiveRootId)) return prev;
      const next = new Set(prev);
      next.add(effectiveRootId);
      return next;
    });
  }, [effectiveRootId]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isVisibleByFilter = (id: string): boolean => {
    const node = dag.nodesById.get(id);
    if (!node) return false;
    if (filters.foldersOnly && !node.isFolder) return false;
    const size = node.file.calculatedSize ?? node.file.size ?? 0;
    if (size < filters.minSizeBytes) return false;
    return true;
  };

  const renderNode = (id: string, depth: number, path: Set<string>) => {
    const node = dag.nodesById.get(id);
    if (!node) return null;
    if (!isVisibleByFilter(id) && depth !== 0) return null;

    const inPath = path.has(id);
    const isExpanded = expanded.has(id) && !inPath;

    const rawChildren = dag.childrenById.get(id) || [];
    const children = rawChildren
      .filter(isVisibleByFilter)
      .slice(0, filters.maxChildrenPerNode);

    const parentIds = dag.parentsById.get(id) || [];
    const parentCount = parentIds.length;

    const icon = node.isFolder ? (
      <Folder size={16} className="text-blue-600 flex-shrink-0" />
    ) : (
      <FileIcon size={16} className="text-gray-500 flex-shrink-0" />
    );

    const sharedBadge = parentCount > 1 ? (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
        shared ×{parentCount}
      </span>
    ) : null;

    return (
      <div key={id}>
        <div
          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            setSelectedNodeId(id);
            if (children.length > 0) toggle(id);
          }}
        >
          <button
            className="text-xs w-6 text-gray-500"
            onClick={(e) => {
              e.stopPropagation();
              if (children.length > 0) toggle(id);
            }}
            title={children.length > 0 ? (isExpanded ? 'Collapse' : 'Expand') : 'No children'}
          >
            {children.length > 0 ? (isExpanded ? '▾' : '▸') : '·'}
          </button>

          {icon}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium truncate">{node.name || '(unnamed)'}</div>
              {sharedBadge}
            </div>
            <div className="text-xs text-gray-500 truncate">
              id: {node.id} • parents: {parentCount}
              {node.mimeType !== FOLDER_MIME ? ` • ${node.mimeType}` : ''}
            </div>
          </div>

          <button
            className="text-xs text-blue-600 hover:text-blue-800 underline"
            onClick={(e) => {
              e.stopPropagation();
              const f = fileById.get(id);
              if (f) onFileClick?.(f);
            }}
          >
            Open
          </button>
        </div>

        {parentCount > 1 && (
          <div
            className="text-xs text-gray-600 px-2 py-1"
            style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
          >
            <span className="text-gray-500 mr-2">Also under:</span>
            {parentIds.slice(0, 5).map((pid) => (
              <button
                key={pid}
                className="mr-2 underline text-purple-700 hover:text-purple-900"
                onClick={() => {
                  setSelectedRootIds([pid]);
                  setExpanded(new Set([pid]));
                }}
                title={pid}
              >
                {dag.nodesById.get(pid)?.name || pid}
              </button>
            ))}
            {parentIds.length > 5 && <span className="text-gray-500">…</span>}
          </div>
        )}

        {inPath && (
          <div
            className="text-xs text-amber-700 px-2 py-1"
            style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
          >
            Cycle guard: already in path
          </div>
        )}

        {isExpanded && depth < filters.maxDepth && (
          <div>
            {children.map((childId) => {
              const nextPath = new Set(path);
              nextPath.add(id);
              return renderNode(childId, depth + 1, nextPath);
            })}
            {rawChildren.length > filters.maxChildrenPerNode && (
              <div
                className="text-xs text-gray-500 px-2 py-1"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              >
                Showing first {filters.maxChildrenPerNode} children…
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!effectiveRootId) {
    return <div className="text-center text-gray-500 py-12">No roots found</div>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2">
      {renderNode(effectiveRootId, 0, new Set())}
    </div>
  );
};
