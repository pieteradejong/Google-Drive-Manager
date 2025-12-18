import { useMemo } from 'react';
import type { DagTabProps } from './types';
import { getSubgraphAround } from '../../../utils/driveDag';

interface PositionedNode {
  id: string;
  col: number;
  row: number;
  label: string;
}

export const LayeredDagTab = ({ dag, selectedNodeId, selectedRootIds, filters, setSelectedNodeId }: DagTabProps) => {
  const fallback = selectedNodeId || selectedRootIds[0] || dag.roots[0] || '';
  const centerId = dag.nodesById.has(fallback) ? fallback : dag.roots[0] || '';

  const subgraph = useMemo(() => {
    if (!centerId) {
      return { nodeIds: new Set<string>(), edges: [], truncated: false, visitedNodes: 0, includedEdges: 0 };
    }
    return getSubgraphAround(dag, centerId, filters.hops, { maxNodes: filters.maxNodes, maxEdges: filters.maxEdges });
  }, [dag, centerId, filters.hops, filters.maxNodes, filters.maxEdges]);

  const layout = useMemo(() => {
    const ids = [...subgraph.nodeIds];
    const depthPairs = ids
      .map((id) => ({ id, depth: dag.depthById.get(id) ?? 0, name: dag.nodesById.get(id)?.name ?? id }))
      .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));

    const minDepth = depthPairs.length ? depthPairs[0].depth : 0;
    const grouped = new Map<number, string[]>();
    for (const p of depthPairs) {
      const col = p.depth - minDepth;
      const arr = grouped.get(col) || [];
      arr.push(p.id);
      grouped.set(col, arr);
    }

    const nodes: PositionedNode[] = [];
    for (const [col, idsInCol] of grouped.entries()) {
      idsInCol.forEach((id, row) => {
        nodes.push({ id, col, row, label: dag.nodesById.get(id)?.name || id });
      });
    }

    const byId = new Map(nodes.map((n) => [n.id, n]));

    const edges = subgraph.edges
      .filter((e) => byId.has(e.from) && byId.has(e.to))
      .slice(0, filters.maxEdges);

    return { nodes, byId, edges, minDepth, colCount: grouped.size };
  }, [dag, subgraph.nodeIds, subgraph.edges, filters.maxEdges]);

  const COL_W = 220;
  const ROW_H = 30;
  const NODE_W = 200;
  const NODE_H = 24;
  const PAD_X = 10;
  const PAD_Y = 10;

  const svgW = Math.max(600, (layout.colCount + 1) * COL_W);
  const svgH = Math.max(300, (Math.max(...layout.nodes.map((n) => n.row), 0) + 2) * ROW_H);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="border-b border-gray-200 px-4 py-2 text-sm text-gray-700 flex items-center justify-between">
        <div>
          Center: <span className="font-semibold">{dag.nodesById.get(centerId)?.name || centerId}</span>
          {subgraph.truncated ? <span className="ml-2 text-amber-700">(truncated)</span> : null}
        </div>
        <div className="text-xs text-gray-500">
          nodes: {subgraph.visitedNodes.toLocaleString()} • edges: {subgraph.includedEdges.toLocaleString()} • hops: {filters.hops}
        </div>
      </div>

      <div className="relative overflow-auto" style={{ maxHeight: '70vh' }}>
        <div style={{ width: svgW, height: svgH }} className="relative">
          <svg width={svgW} height={svgH} className="absolute left-0 top-0">
            {layout.edges.map((e, idx) => {
              const from = layout.byId.get(e.from)!;
              const to = layout.byId.get(e.to)!;

              const x1 = PAD_X + from.col * COL_W + NODE_W;
              const y1 = PAD_Y + from.row * ROW_H + NODE_H / 2;
              const x2 = PAD_X + to.col * COL_W;
              const y2 = PAD_Y + to.row * ROW_H + NODE_H / 2;

              const mx = (x1 + x2) / 2;
              const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;

              return <path key={idx} d={d} fill="none" stroke="#CBD5E1" strokeWidth={1.2} />;
            })}
          </svg>

          {layout.nodes.map((n) => {
            const left = PAD_X + n.col * COL_W;
            const top = PAD_Y + n.row * ROW_H;
            const isCenter = n.id === centerId;

            return (
              <button
                key={n.id}
                onClick={() => setSelectedNodeId(n.id)}
                className={`absolute text-left px-2 py-1 rounded border text-xs truncate hover:bg-gray-50 ${
                  isCenter ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'
                }`}
                style={{ left, top, width: NODE_W, height: NODE_H }}
                title={n.label}
              >
                {n.label || n.id}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
