import { useMemo } from 'react';
import type { DagTabProps } from './types';
import { countDescendants, getNodeSizeBytes } from '../../../utils/driveDag';

export const SharedHubsTab = ({ dag, selectedNodeId, setSelectedNodeId, filters }: DagTabProps) => {
  const rows = useMemo(() => {
    const candidates: Array<{ id: string; parentCount: number }> = [];
    for (const [id, parents] of dag.parentsById) {
      const pc = parents?.length || 0;
      if (pc > 1) candidates.push({ id, parentCount: pc });
    }

    candidates.sort((a, b) => b.parentCount - a.parentCount);

    const top = candidates.slice(0, Math.min(200, candidates.length));

    // Compute descendant counts only for top N to keep it fast.
    const enriched = top.map((c) => {
      const desc = countDescendants(dag, c.id, { maxNodes: Math.min(filters.maxNodes, 5000), maxHops: Math.min(filters.maxDepth, 20) });
      const node = dag.nodesById.get(c.id);
      const size = node ? getNodeSizeBytes(node.file) : 0;
      return {
        id: c.id,
        name: node?.name || c.id,
        parentCount: c.parentCount,
        descendantCount: desc.descendantCount,
        truncated: desc.truncated,
        size,
      };
    });

    enriched.sort((a, b) => {
      if (b.parentCount !== a.parentCount) return b.parentCount - a.parentCount;
      if (b.descendantCount !== a.descendantCount) return b.descendantCount - a.descendantCount;
      return b.size - a.size;
    });

    return enriched;
  }, [dag, filters.maxNodes, filters.maxDepth]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-900">Shared hubs</div>
        <div className="text-xs text-gray-500">
          Nodes with multiple parents. Descendant counts are capped (may be truncated).
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr className="text-left">
              <th className="px-4 py-2 border-b">Name</th>
              <th className="px-4 py-2 border-b">Parents</th>
              <th className="px-4 py-2 border-b">Descendants</th>
              <th className="px-4 py-2 border-b">Trunc</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSelected = r.id === selectedNodeId;
              return (
                <tr
                  key={r.id}
                  className={`border-b hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                  onClick={() => setSelectedNodeId(r.id)}
                  title={r.id}
                >
                  <td className="px-4 py-2 max-w-[520px] truncate font-medium">{r.name}</td>
                  <td className="px-4 py-2">{r.parentCount}</td>
                  <td className="px-4 py-2">{r.descendantCount}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{r.truncated ? 'yes' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 text-xs text-gray-500">
        Showing top {rows.length} by parent count.
      </div>
    </div>
  );
};
