import { useMemo } from 'react';
import type { DagTabProps } from './types';
import { reachableFromRoots, getMultiParentIds } from '../../../utils/driveDag';

export const OrphansTab = ({ dag, selectedRootIds, setSelectedNodeId, filters }: DagTabProps) => {
  // Memoize roots to avoid recalculating on every render
  const roots = useMemo(() => {
    return selectedRootIds.length > 0 ? selectedRootIds : dag.roots.slice(0, 20);
  }, [selectedRootIds, dag.roots]);
  
  // Create a stable key for the roots array
  const rootsKey = useMemo(() => roots.join('|'), [roots]);

  const { orphans, truncated } = useMemo(() => {
    const reach = reachableFromRoots(dag, roots, { maxNodes: filters.maxNodes, maxHops: filters.maxDepth });
    const multiParent = new Set(getMultiParentIds(dag));

    const orphans: string[] = [];
    for (const id of dag.nodesById.keys()) {
      if (reach.reachable.has(id)) continue;
      const node = dag.nodesById.get(id);
      if (!node) continue;
      if (filters.foldersOnly && !node.isFolder) continue;
      const size = node.file.calculatedSize ?? node.file.size ?? 0;
      if (size < filters.minSizeBytes) continue;
      // Optional extra filter: if minSizeBytes is 0, still show multi-parent or everything.
      // (We keep it simple: show everything that passes other filters.)
      // Could later add: show only multi-parent.
      orphans.push(id);
      if (orphans.length >= 2000) break;
    }

    // Put multi-parent near the top
    orphans.sort((a, b) => {
      const am = multiParent.has(a) ? 1 : 0;
      const bm = multiParent.has(b) ? 1 : 0;
      if (bm !== am) return bm - am;
      return (dag.nodesById.get(a)?.name || a).localeCompare(dag.nodesById.get(b)?.name || b);
    });

    return { orphans, truncated: reach.truncated };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dag, rootsKey, filters.maxNodes, filters.maxDepth, filters.foldersOnly, filters.minSizeBytes]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-900">Orphans / Unreachable</div>
        <div className="text-xs text-gray-500">
          Items not reachable from the selected roots via parent→child edges.
          {truncated ? <span className="ml-2 text-amber-700">Reachability truncated by caps</span> : null}
        </div>
      </div>

      <div className="p-4">
        {orphans.length === 0 ? (
          <div className="text-sm text-gray-500">No unreachable items under current caps/filters.</div>
        ) : (
          <div className="space-y-2 max-h-[70vh] overflow-auto">
            {orphans.slice(0, 500).map((id) => (
              <button
                key={id}
                className="w-full text-left px-3 py-2 rounded border border-gray-200 hover:bg-gray-50"
                onClick={() => setSelectedNodeId(id)}
                title={id}
              >
                <div className="text-sm font-medium truncate">{dag.nodesById.get(id)?.name || id}</div>
                <div className="text-xs text-gray-500 truncate">
                  parents: {(dag.parentsById.get(id) || []).length} • depth: {dag.depthById.get(id) ?? 0}
                </div>
              </button>
            ))}
            {orphans.length > 500 && <div className="text-xs text-gray-500">Showing first 500…</div>}
          </div>
        )}
      </div>
    </div>
  );
};
