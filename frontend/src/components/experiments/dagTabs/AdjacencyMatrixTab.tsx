import { useMemo, useState } from 'react';
import type { DagTabProps } from './types';
import { getSubgraphAround } from '../../../utils/driveDag';

export const AdjacencyMatrixTab = ({ dag, selectedNodeId, selectedRootIds, filters, setSelectedNodeId }: DagTabProps) => {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const fallback = selectedNodeId || selectedRootIds[0] || dag.roots[0] || '';
  const centerId = dag.nodesById.has(fallback) ? fallback : '';

  const subgraph = useMemo(() => {
    if (!centerId) {
      return { nodeIds: new Set<string>(), edges: [], truncated: false, visitedNodes: 0, includedEdges: 0 };
    }
    // Keep matrix small
    return getSubgraphAround(dag, centerId, Math.min(filters.hops, 2), { maxNodes: Math.min(filters.maxNodes, 60), maxEdges: Math.min(filters.maxEdges, 400) });
  }, [dag, centerId, filters.hops, filters.maxNodes, filters.maxEdges]);

  const { nodes, edgeSet } = useMemo(() => {
    const ids = [...subgraph.nodeIds];
    ids.sort((a, b) => (dag.nodesById.get(a)?.name || a).localeCompare(dag.nodesById.get(b)?.name || b));
    const set = new Set<string>();
    for (const e of subgraph.edges) set.add(`${e.from}->${e.to}`);
    return { nodes: ids, edgeSet: set };
  }, [subgraph.nodeIds, subgraph.edges, dag]);

  if (!centerId) {
    return <div className="text-center text-gray-500 py-12">Select a node to build a local matrix</div>;
  }

  if (nodes.length === 0) {
    return <div className="text-center text-gray-500 py-12">No nodes in subgraph</div>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-200 text-sm text-gray-700 flex items-center justify-between">
        <div>
          Local adjacency matrix around <span className="font-semibold">{dag.nodesById.get(centerId)?.name || centerId}</span>
          {subgraph.truncated ? <span className="ml-2 text-amber-700">(truncated)</span> : null}
        </div>
        <div className="text-xs text-gray-500">nodes: {nodes.length} • edges: {subgraph.edges.length}</div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
        <table className="border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              <th className="sticky left-0 bg-white z-20 border border-gray-200 p-2 text-xs text-gray-600">from \ to</th>
              {nodes.map((id) => (
                <th
                  key={id}
                  className={`border border-gray-200 p-2 text-[10px] text-gray-600 min-w-[120px] max-w-[160px] truncate ${
                    hoverId === id ? 'bg-amber-50' : ''
                  }`}
                  onMouseEnter={() => setHoverId(id)}
                  onMouseLeave={() => setHoverId(null)}
                  title={id}
                >
                  {dag.nodesById.get(id)?.name || id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nodes.map((from) => (
              <tr key={from}>
                <th
                  className={`sticky left-0 bg-white z-10 border border-gray-200 p-2 text-xs text-gray-700 text-left min-w-[220px] max-w-[260px] truncate ${
                    hoverId === from ? 'bg-amber-50' : ''
                  }`}
                  onMouseEnter={() => setHoverId(from)}
                  onMouseLeave={() => setHoverId(null)}
                  title={from}
                >
                  <button className="underline" onClick={() => setSelectedNodeId(from)}>
                    {dag.nodesById.get(from)?.name || from}
                  </button>
                </th>
                {nodes.map((to) => {
                  const has = edgeSet.has(`${from}->${to}`);
                  const highlighted = hoverId === from || hoverId === to;
                  return (
                    <td
                      key={to}
                      className={`border border-gray-200 p-0.5 ${highlighted ? 'bg-amber-50' : ''}`}
                      title={has ? `${from} -> ${to}` : ''}
                    >
                      {has ? <div className="w-full h-6 bg-blue-500/70" /> : <div className="w-full h-6" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 text-xs text-gray-500">
        Hover to highlight row/column. Blue cells indicate a directed edge.
      </div>
    </div>
  );
};
