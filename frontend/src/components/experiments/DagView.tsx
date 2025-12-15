/** DAG View - Inspect Google Drive parent/child relationships as a DAG */
import { useMemo, useState } from 'react';
import { Folder, File as FileIcon, AlertTriangle } from 'lucide-react';
import type { FileItem } from '../../types/drive';
import { buildDriveDag } from '../../utils/driveDag';
import { LoadingState } from '../LoadingState';

interface DagViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const DagView = ({ files, onFileClick }: DagViewProps) => {
  const [selectedRootId, setSelectedRootId] = useState<string>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [maxDepth, setMaxDepth] = useState<number>(4);
  const [maxChildrenPerNode, setMaxChildrenPerNode] = useState<number>(50);

  const dag = useMemo(() => {
    return buildDriveDag(files);
  }, [files]);

  const fileById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  // Pick a stable initial root once we have data
  const effectiveRootId = useMemo(() => {
    if (selectedRootId && dag.nodesById.has(selectedRootId)) return selectedRootId;
    return dag.roots[0] || '';
  }, [selectedRootId, dag.roots, dag.nodesById]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (id: string, depth: number, path: Set<string>) => {
    const node = dag.nodesById.get(id);
    if (!node) return null;

    // Prevent infinite expansion if cycles exist
    const inPath = path.has(id);
    const isExpanded = expanded.has(id) && !inPath;

    const children = (dag.childrenById.get(id) || []).slice(0, maxChildrenPerNode);

    const icon = node.isFolder ? (
      <Folder size={16} className="text-blue-600 flex-shrink-0" />
    ) : (
      <FileIcon size={16} className="text-gray-500 flex-shrink-0" />
    );

    return (
      <div key={id} className="select-none">
        <div
          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
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
            <div className="text-sm font-medium truncate">{node.name || '(unnamed)'}</div>
            <div className="text-xs text-gray-500 truncate">
              id: {node.id} • parents: {(dag.parentsById.get(id) || []).length}
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

        {inPath && (
          <div
            className="text-xs text-amber-700 px-2 py-1"
            style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
          >
            Cycle guard: already in path
          </div>
        )}

        {isExpanded && depth < maxDepth && (
          <div>
            {children.length === 0 ? (
              <div
                className="text-xs text-gray-500 px-2 py-1"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              >
                No children
              </div>
            ) : (
              children.map((childId) => {
                const nextPath = new Set(path);
                nextPath.add(id);
                return renderNode(childId, depth + 1, nextPath);
              })
            )}
            {(dag.childrenById.get(id) || []).length > maxChildrenPerNode && (
              <div
                className="text-xs text-gray-500 px-2 py-1"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              >
                Showing first {maxChildrenPerNode} children...
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!files || files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center text-gray-500">
          <p className="text-lg font-medium mb-2">No data to display</p>
          <p className="text-sm">Run a full scan to build the DAG</p>
        </div>
      </div>
    );
  }

  // If a very large drive, the build may still take a moment on first render.
  // Keep UI consistent with other views.
  if (!dag || dag.nodesById.size === 0) {
    return (
      <LoadingState
        operation="Building DAG"
        details={`Processing ${files.length.toLocaleString()} items...`}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-gray-900">DAG View</h2>
            <p className="text-sm text-gray-600 mt-1">
              Directory structure as a DAG (multi-parent aware). This is a correctness-first view.
            </p>
          </div>

          {dag.warnings.notes.length > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle size={18} className="text-amber-700 mt-0.5" />
              <div className="text-xs text-amber-900">
                <div className="font-semibold">Notes</div>
                <ul className="list-disc list-inside">
                  {dag.warnings.notes.slice(0, 3).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500">Nodes</div>
            <div className="text-lg font-semibold">{dag.nodesById.size.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500">Edges</div>
            <div className="text-lg font-semibold">{dag.edges.length.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500">Roots</div>
            <div className="text-lg font-semibold">{dag.roots.length.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500">Max depth</div>
            <div className="text-lg font-semibold">{dag.maxDepth.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500">Cycles</div>
            <div className="text-lg font-semibold">
              {dag.warnings.cycleDetected ? `Yes (${dag.warnings.cycleNodeCount})` : 'No'}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Root:</label>
            <select
              value={effectiveRootId}
              onChange={(e) => {
                setSelectedRootId(e.target.value);
                setExpanded(new Set());
              }}
              className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
            >
              {dag.roots.slice(0, 200).map((id) => (
                <option key={id} value={id}>
                  {dag.nodesById.get(id)?.name || id}
                </option>
              ))}
            </select>
            {dag.roots.length > 200 && (
              <span className="text-xs text-gray-500">Showing first 200 roots</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Max depth:</label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxDepth}
              onChange={(e) => setMaxDepth(Math.max(1, Math.min(20, Number(e.target.value) || 4)))}
              className="w-20 border border-gray-300 rounded px-2 py-1 text-sm bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Children cap:</label>
            <input
              type="number"
              min={10}
              max={500}
              value={maxChildrenPerNode}
              onChange={(e) => setMaxChildrenPerNode(Math.max(10, Math.min(500, Number(e.target.value) || 50)))}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm bg-white"
            />
          </div>

          <button
            onClick={() => setExpanded(new Set([effectiveRootId]))}
            className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
            disabled={!effectiveRootId}
          >
            Expand root
          </button>
          <button
            onClick={() => setExpanded(new Set())}
            className="text-sm px-3 py-1.5 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-5xl mx-auto">
          {!effectiveRootId ? (
            <div className="text-center text-gray-500 py-12">No roots found</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-2">
              {renderNode(effectiveRootId, 0, new Set())}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
