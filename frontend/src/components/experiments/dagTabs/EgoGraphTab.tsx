import { Folder, File as FileIcon } from 'lucide-react';
import type { DagTabProps } from './types';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

const NodeRow = ({
  id,
  label,
  dag,
  onSelect,
  onOpen,
}: {
  id: string;
  label: string;
  dag: DagTabProps['dag'];
  onSelect: () => void;
  onOpen: () => void;
}) => {
  const node = dag.nodesById.get(id);
  if (!node) return null;
  const icon = node.isFolder ? (
    <Folder size={16} className="text-blue-600 flex-shrink-0" />
  ) : (
    <FileIcon size={16} className="text-gray-500 flex-shrink-0" />
  );

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100">
      <div className="w-10 text-[10px] text-gray-500">{label}</div>
      {icon}
      <button className="flex-1 min-w-0 text-left" onClick={onSelect}>
        <div className="text-sm font-medium truncate">{node.name || '(unnamed)'}</div>
        <div className="text-xs text-gray-500 truncate">
          id: {id} • parents: {(dag.parentsById.get(id) || []).length}
          {node.mimeType !== FOLDER_MIME ? ` • ${node.mimeType}` : ''}
        </div>
      </button>
      <button className="text-xs text-blue-600 hover:text-blue-800 underline" onClick={onOpen}>
        Open
      </button>
    </div>
  );
};

export const EgoGraphTab = ({
  dag,
  fileById,
  selectedNodeId,
  setSelectedNodeId,
  selectedRootIds,
  setSelectedRootIds,
  onFileClick,
}: DagTabProps) => {
  const fallback = selectedRootIds[0] || dag.roots[0] || '';
  const centerId = dag.nodesById.has(selectedNodeId) ? selectedNodeId : fallback;
  const center = dag.nodesById.get(centerId);

  if (!centerId || !center) {
    return <div className="text-center text-gray-500 py-12">Pick a node to inspect</div>;
  }

  const parents = dag.parentsById.get(centerId) || [];
  const children = dag.childrenById.get(centerId) || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="text-sm font-semibold text-gray-900 mb-2">Parents ({parents.length})</div>
        {parents.length === 0 ? (
          <div className="text-sm text-gray-500">No parents (root)</div>
        ) : (
          <div className="space-y-1">
            {parents.slice(0, 200).map((pid) => (
              <NodeRow
                key={pid}
                id={pid}
                label="parent"
                dag={dag}
                onSelect={() => setSelectedNodeId(pid)}
                onOpen={() => {
                  const f = fileById.get(pid);
                  if (f) onFileClick?.(f);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="text-sm font-semibold text-gray-900 mb-2">Selected node</div>
        <div className="flex items-center gap-2">
          {center.isFolder ? (
            <Folder size={18} className="text-blue-600" />
          ) : (
            <FileIcon size={18} className="text-gray-600" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold truncate">{center.name || '(unnamed)'}</div>
            <div className="text-xs text-gray-500 truncate">id: {centerId}</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 border border-gray-200 rounded p-2">
            <div className="text-gray-500">Parents</div>
            <div className="font-semibold">{parents.length}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded p-2">
            <div className="text-gray-500">Children</div>
            <div className="font-semibold">{children.length}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => setSelectedRootIds([centerId])}
          >
            Set as root
          </button>
          <button
            className="text-sm px-3 py-1.5 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
            onClick={() => {
              const f = fileById.get(centerId);
              if (f) onFileClick?.(f);
            }}
          >
            Open in Drive
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-3">
        <div className="text-sm font-semibold text-gray-900 mb-2">Children ({children.length})</div>
        {children.length === 0 ? (
          <div className="text-sm text-gray-500">No children</div>
        ) : (
          <div className="space-y-1">
            {children.slice(0, 200).map((cid) => (
              <NodeRow
                key={cid}
                id={cid}
                label="child"
                dag={dag}
                onSelect={() => setSelectedNodeId(cid)}
                onOpen={() => {
                  const f = fileById.get(cid);
                  if (f) onFileClick?.(f);
                }}
              />
            ))}
            {children.length > 200 && <div className="text-xs text-gray-500">Showing first 200…</div>}
          </div>
        )}
      </div>
    </div>
  );
};
