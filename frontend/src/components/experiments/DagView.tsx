/** DAG Lab - Multiple views over a filesystem DAG */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import type { FileItem } from '../../types/drive';
import { buildDriveDag } from '../../utils/driveDag';
import { LoadingState } from '../LoadingState';

import type { DagFilters, DagTabId } from './dagTabs/types';
import { TreeProjectionTab } from './dagTabs/TreeProjectionTab';
import { LayeredDagTab } from './dagTabs/LayeredDagTab';
import { EgoGraphTab } from './dagTabs/EgoGraphTab';
import { PathExplorerTab } from './dagTabs/PathExplorerTab';
import { SharedHubsTab } from './dagTabs/SharedHubsTab';
import { FolderOnlyTab } from './dagTabs/FolderOnlyTab';
import { AdjacencyMatrixTab } from './dagTabs/AdjacencyMatrixTab';
import { SankeyBySizeTab } from './dagTabs/SankeyBySizeTab';
import { OrphansTab } from './dagTabs/OrphansTab';

interface DagViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

const TAB_DEFS: Array<{ id: DagTabId; label: string }> = [
  { id: 'tree', label: 'Tree' },
  { id: 'layered', label: 'Layered' },
  { id: 'ego', label: 'Ego' },
  { id: 'paths', label: 'Paths' },
  { id: 'hubs', label: 'Hubs' },
  { id: 'folderOnly', label: 'Folders only' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'sankey', label: 'Sankey' },
  { id: 'orphans', label: 'Orphans' },
];

const DEFAULT_FILTERS: DagFilters = {
  foldersOnly: false,
  minSizeBytes: 0,
  maxDepth: 6,
  maxNodes: 2000,
  maxEdges: 5000,
  maxChildrenPerNode: 50,
  hops: 2,
  maxPaths: 20,
};

export const DagView = ({ files, onFileClick }: DagViewProps) => {
  const [activeTab, setActiveTab] = useState<DagTabId>('tree');
  const [filters, setFilters] = useState<DagFilters>(DEFAULT_FILTERS);

  const dag = useMemo(() => buildDriveDag(files), [files]);
  const fileById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [selectedRootIds, setSelectedRootIds] = useState<string[]>([]);

  // Initialize defaults once data is available
  useEffect(() => {
    if (dag.roots.length === 0) return;

    setSelectedRootIds((prev) => (prev.length > 0 ? prev : [dag.roots[0]]));
    setSelectedNodeId((prev) => (prev && dag.nodesById.has(prev) ? prev : dag.roots[0]));
  }, [dag.roots, dag.nodesById]);

  const [searchQuery, setSearchQuery] = useState('');

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as Array<{ id: string; name: string }>;

    const out: Array<{ id: string; name: string }> = [];
    for (const [id, node] of dag.nodesById) {
      if (!node.name) continue;
      if (node.name.toLowerCase().includes(q)) {
        out.push({ id, name: node.name });
        if (out.length >= 20) break;
      }
    }
    return out;
  }, [searchQuery, dag.nodesById]);

  const effectiveSelectedRoots = useMemo(() => {
    const valid = selectedRootIds.filter((id) => dag.nodesById.has(id));
    return valid.length > 0 ? valid : dag.roots.slice(0, 1);
  }, [selectedRootIds, dag.roots, dag.nodesById]);

  const tabProps = {
    dag,
    files,
    fileById,
    selectedNodeId: selectedNodeId && dag.nodesById.has(selectedNodeId) ? selectedNodeId : effectiveSelectedRoots[0] || '',
    setSelectedNodeId: (id: string) => setSelectedNodeId(id),
    selectedRootIds: effectiveSelectedRoots,
    setSelectedRootIds: (ids: string[]) => setSelectedRootIds(ids),
    filters,
    setFilters,
    onFileClick,
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

  if (!dag || dag.nodesById.size === 0) {
    return <LoadingState operation="Building DAG" details={`Processing ${files.length.toLocaleString()} items...`} />;
  }

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'tree':
        return <TreeProjectionTab {...tabProps} />;
      case 'layered':
        return <LayeredDagTab {...tabProps} />;
      case 'ego':
        return <EgoGraphTab {...tabProps} />;
      case 'paths':
        return <PathExplorerTab {...tabProps} />;
      case 'hubs':
        return <SharedHubsTab {...tabProps} />;
      case 'folderOnly':
        return <FolderOnlyTab {...tabProps} />;
      case 'matrix':
        return <AdjacencyMatrixTab {...tabProps} />;
      case 'sankey':
        return <SankeyBySizeTab {...tabProps} />;
      case 'orphans':
        return <OrphansTab {...tabProps} />;
      default:
        return <TreeProjectionTab {...tabProps} />;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-gray-900">DAG Lab</h2>
            <p className="text-sm text-gray-600 mt-1">
              Multiple perspectives over your Drive DAG (multi-parent aware). Use Search-first + tabs.
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

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mt-4">
          {TAB_DEFS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`text-sm px-3 py-1.5 rounded border transition-colors ${
                activeTab === t.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Controls + Search */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-700 mb-2">Global caps</div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={filters.foldersOnly}
                  onChange={(e) => setFilters({ ...filters, foldersOnly: e.target.checked })}
                />
                Folders only
              </label>

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">Max depth</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={filters.maxDepth}
                  onChange={(e) => setFilters({ ...filters, maxDepth: Math.max(1, Math.min(30, Number(e.target.value) || 6)) })}
                  className="w-20 border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">Children</label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={filters.maxChildrenPerNode}
                  onChange={(e) =>
                    setFilters({ ...filters, maxChildrenPerNode: Math.max(10, Math.min(500, Number(e.target.value) || 50)) })
                  }
                  className="w-20 border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">Hops</label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={filters.hops}
                  onChange={(e) => setFilters({ ...filters, hops: Math.max(1, Math.min(6, Number(e.target.value) || 2)) })}
                  className="w-16 border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                />
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">Max nodes</label>
                <input
                  type="number"
                  min={100}
                  max={50000}
                  value={filters.maxNodes}
                  onChange={(e) => setFilters({ ...filters, maxNodes: Math.max(100, Number(e.target.value) || 2000) })}
                  className="w-28 border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">Max edges</label>
                <input
                  type="number"
                  min={200}
                  max={100000}
                  value={filters.maxEdges}
                  onChange={(e) => setFilters({ ...filters, maxEdges: Math.max(200, Number(e.target.value) || 5000) })}
                  className="w-28 border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">Min size (MB)</label>
                <input
                  type="number"
                  min={0}
                  max={1024 * 1024}
                  value={Math.round(filters.minSizeBytes / (1024 * 1024))}
                  onChange={(e) => {
                    const mb = Math.max(0, Number(e.target.value) || 0);
                    setFilters({ ...filters, minSizeBytes: mb * 1024 * 1024 });
                  }}
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-700 mb-2">Roots</div>
            <div className="flex flex-wrap gap-2">
              <select
                multiple
                value={effectiveSelectedRoots}
                onChange={(e) => {
                  const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
                  setSelectedRootIds(ids);
                }}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white h-24"
              >
                {dag.roots.slice(0, 300).map((id) => (
                  <option key={id} value={id}>
                    {dag.nodesById.get(id)?.name || id}
                  </option>
                ))}
              </select>
              <div className="text-xs text-gray-500">
                Tip: hold Cmd/Ctrl to multi-select. Showing first 300 roots.
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-700 mb-2">Search</div>
            <div className="flex items-center gap-2">
              <Search size={16} className="text-gray-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name…"
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm bg-white"
              />
              <button
                className="text-sm px-3 py-1.5 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                onClick={() => setSearchQuery('')}
              >
                Clear
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-2 border border-gray-200 rounded bg-white max-h-40 overflow-auto">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50"
                    onClick={() => {
                      setSelectedNodeId(r.id);
                      setActiveTab('ego');
                      setSearchQuery('');
                    }}
                    title={r.id}
                  >
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-xs text-gray-500 truncate">{r.id}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-2 text-xs text-gray-500">
              Selected: <span className="font-medium">{dag.nodesById.get(tabProps.selectedNodeId)?.name || tabProps.selectedNodeId}</span>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => setActiveTab('ego')}
              >
                Inspect
              </button>
              <button
                className="text-sm px-3 py-1.5 rounded bg-white border border-gray-200 hover:bg-gray-50"
                onClick={() => setActiveTab('layered')}
              >
                Local graph
              </button>
              <button
                className="text-sm px-3 py-1.5 rounded bg-white border border-gray-200 hover:bg-gray-50"
                onClick={() => setActiveTab('paths')}
              >
                Paths
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-6xl mx-auto">{renderActiveTab()}</div>
      </div>
    </div>
  );
};
