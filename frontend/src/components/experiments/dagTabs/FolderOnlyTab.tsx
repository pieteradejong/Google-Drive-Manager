import { useMemo, useState } from 'react';
import { Folder } from 'lucide-react';
import type { DagTabProps } from './types';

export const FolderOnlyTab = ({ dag, selectedRootIds, setSelectedNodeId, filters }: DagTabProps) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const folderIds = useMemo(() => {
    const s = new Set<string>();
    for (const [id, n] of dag.nodesById) {
      if (n.isFolder) s.add(id);
    }
    return s;
  }, [dag]);

  const folderRoots = useMemo(() => {
    const roots: string[] = [];
    for (const id of folderIds) {
      const parents = dag.parentsById.get(id) || [];
      const hasFolderParent = parents.some((p) => folderIds.has(p));
      if (!hasFolderParent) roots.push(id);
    }
    roots.sort((a, b) => (dag.nodesById.get(a)?.name || a).localeCompare(dag.nodesById.get(b)?.name || b));
    return roots;
  }, [dag, folderIds]);

  const rootId = selectedRootIds[0] && folderIds.has(selectedRootIds[0]) ? selectedRootIds[0] : folderRoots[0] || '';

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderFolder = (id: string, depth: number, path: Set<string>) => {
    const node = dag.nodesById.get(id);
    if (!node || !node.isFolder) return null;

    const inPath = path.has(id);
    const isExpanded = expanded.has(id) && !inPath;

    const children = (dag.childrenById.get(id) || [])
      .filter((cid) => folderIds.has(cid))
      .slice(0, filters.maxChildrenPerNode);

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
          >
            {children.length > 0 ? (isExpanded ? '▾' : '▸') : '·'}
          </button>
          <Folder size={16} className="text-blue-600" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{node.name || '(unnamed)'}</div>
            <div className="text-xs text-gray-500 truncate">id: {id}</div>
          </div>
        </div>

        {inPath && (
          <div className="text-xs text-amber-700 px-2 py-1" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
            Cycle guard: already in path
          </div>
        )}

        {isExpanded && depth < filters.maxDepth && (
          <div>
            {children.map((cid) => {
              const nextPath = new Set(path);
              nextPath.add(id);
              return renderFolder(cid, depth + 1, nextPath);
            })}
          </div>
        )}
      </div>
    );
  };

  if (!rootId) {
    return <div className="text-center text-gray-500 py-12">No folders found</div>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2">
      {renderFolder(rootId, 0, new Set())}
    </div>
  );
};
