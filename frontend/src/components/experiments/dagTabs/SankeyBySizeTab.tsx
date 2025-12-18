import { useMemo } from 'react';
import type { DagTabProps } from './types';
import { getSubgraphAround, getNodeSizeBytes } from '../../../utils/driveDag';

interface FlowRow {
  from: string;
  to: string;
  value: number;
}

export const SankeyBySizeTab = ({ dag, selectedNodeId, selectedRootIds, filters, setSelectedNodeId }: DagTabProps) => {
  const fallback = selectedNodeId || selectedRootIds[0] || dag.roots[0] || '';
  const centerId = dag.nodesById.has(fallback) ? fallback : '';

  const subgraph = useMemo(() => {
    if (!centerId) {
      return { nodeIds: new Set<string>(), edges: [], truncated: false, visitedNodes: 0, includedEdges: 0 };
    }
    // Keep small; "count-per-edge" doubles counts if multi-parent.
    return getSubgraphAround(dag, centerId, filters.hops, {
      maxNodes: Math.min(filters.maxNodes, 500),
      maxEdges: Math.min(filters.maxEdges, 1200),
    });
  }, [dag, centerId, filters.hops, filters.maxNodes, filters.maxEdges]);

  const flows = useMemo(() => {
    const rows: FlowRow[] = [];
    for (const e of subgraph.edges) {
      const toNode = dag.nodesById.get(e.to);
      if (!toNode) continue;
      const v = getNodeSizeBytes(toNode.file);
      if (v <= 0) continue;
      rows.push({ from: e.from, to: e.to, value: v });
    }

    rows.sort((a, b) => b.value - a.value);
    const top = rows.slice(0, 50);
    const maxV = top[0]?.value || 1;
    return { top, maxV };
  }, [subgraph.edges, dag]);

  if (!centerId) {
    return <div className="text-center text-gray-500 py-12">Select a node to view flows</div>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-900">Sankey by Size (MVP)</div>
        <div className="text-xs text-gray-500">
          Shows top containment edges by child size within a local subgraph. Counting is <span className="font-medium">per edge</span> (multi-parent may double count).
        </div>
      </div>

      <div className="p-4 space-y-2">
        {subgraph.truncated ? <div className="text-xs text-amber-700">Subgraph truncated by caps</div> : null}

        {flows.top.length === 0 ? (
          <div className="text-sm text-gray-500">No size-carrying edges found in this subgraph.</div>
        ) : (
          flows.top.map((r) => {
            const fromName = dag.nodesById.get(r.from)?.name || r.from;
            const toName = dag.nodesById.get(r.to)?.name || r.to;
            const w = Math.max(2, Math.round((r.value / flows.maxV) * 100));
            return (
              <div key={`${r.from}->${r.to}`} className="flex items-center gap-3">
                <button className="text-xs underline text-gray-800 max-w-[240px] truncate" onClick={() => setSelectedNodeId(r.from)} title={r.from}>
                  {fromName}
                </button>
                <div className="text-xs text-gray-400">→</div>
                <button className="text-xs underline text-gray-800 max-w-[260px] truncate" onClick={() => setSelectedNodeId(r.to)} title={r.to}>
                  {toName}
                </button>
                <div className="flex-1">
                  <div className="h-2 bg-blue-500/70 rounded" style={{ width: `${w}%` }} />
                </div>
                <div className="text-xs text-gray-600 tabular-nums">{(r.value / (1024 * 1024)).toFixed(1)} MB</div>
              </div>
            );
          })
        )}

        <div className="pt-2 text-xs text-gray-500">Showing top {flows.top.length} edges by child size.</div>
      </div>
    </div>
  );
};
