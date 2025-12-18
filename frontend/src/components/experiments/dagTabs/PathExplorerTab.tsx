import { useMemo } from 'react';
import type { DagTabProps } from './types';

interface PathResult {
  rootId: string;
  path: string[];
}

function computeDistancesToTarget(dag: DagTabProps['dag'], targetId: string, maxNodes: number) {
  // Reverse BFS from target along parents to compute distance from any ancestor to target.
  const dist = new Map<string, number>();
  const q: string[] = [];

  dist.set(targetId, 0);
  q.push(targetId);

  while (q.length > 0) {
    const cur = q.shift()!;
    const d = dist.get(cur)!;
    const parents = dag.parentsById.get(cur) || [];

    for (const p of parents) {
      if (dist.has(p)) continue;
      dist.set(p, d + 1);
      if (dist.size >= maxNodes) return { dist, truncated: true };
      q.push(p);
    }
  }

  return { dist, truncated: false };
}

function reconstructSomePaths(
  dag: DagTabProps['dag'],
  roots: string[],
  targetId: string,
  distToTarget: Map<string, number>,
  maxPaths: number,
  maxPathLen: number
): PathResult[] {
  const results: PathResult[] = [];

  for (const rootId of roots) {
    if (results.length >= maxPaths) break;
    const d = distToTarget.get(rootId);
    if (d === undefined) continue;

    // DFS over choices that reduce distance (keeps paths shortest), capped.
    const stack: Array<{ cur: string; path: string[] }> = [{ cur: rootId, path: [rootId] }];

    while (stack.length > 0 && results.length < maxPaths) {
      const { cur, path } = stack.pop()!;
      if (path.length > maxPathLen) continue;
      if (cur === targetId) {
        results.push({ rootId, path });
        break; // keep one per root in MVP; still benefits multi-root
      }

      const curDist = distToTarget.get(cur);
      if (curDist === undefined) continue;

      const nexts = (dag.childrenById.get(cur) || []).filter((c) => distToTarget.get(c) === curDist - 1);
      // deterministic order
      nexts.sort((a, b) => (dag.nodesById.get(a)?.name || a).localeCompare(dag.nodesById.get(b)?.name || b));

      for (let i = nexts.length - 1; i >= 0; i--) {
        const n = nexts[i];
        if (path.includes(n)) continue; // guard
        stack.push({ cur: n, path: [...path, n] });
      }
    }
  }

  return results;
}

export const PathExplorerTab = ({ dag, selectedNodeId, setSelectedNodeId, selectedRootIds, filters }: DagTabProps) => {
  const fallback = selectedNodeId || selectedRootIds[0] || dag.roots[0] || '';
  const targetId = dag.nodesById.has(fallback) ? fallback : '';

  const roots = selectedRootIds.length > 0 ? selectedRootIds : dag.roots.slice(0, 20);

  const { paths, truncated } = useMemo(() => {
    if (!targetId) return { paths: [] as PathResult[], truncated: false };

    const { dist, truncated: distTrunc } = computeDistancesToTarget(dag, targetId, Math.max(filters.maxNodes, 5_000));
    const paths = reconstructSomePaths(dag, roots, targetId, dist, filters.maxPaths, Math.max(20, filters.maxDepth * 3));
    return { paths, truncated: distTrunc };
  }, [dag, targetId, roots.join('|'), filters.maxNodes, filters.maxPaths, filters.maxDepth]);

  if (!targetId) {
    return <div className="text-center text-gray-500 py-12">Select a node to explore paths</div>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Target</div>
          <div className="text-sm text-gray-800">
            {dag.nodesById.get(targetId)?.name || targetId}
            <span className="text-xs text-gray-500 ml-2">({targetId})</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">Roots considered: {roots.length}</div>
        </div>
        {truncated ? <div className="text-xs text-amber-700">Distance map truncated by caps</div> : null}
      </div>

      <div className="mt-4 space-y-3">
        {paths.length === 0 ? (
          <div className="text-sm text-gray-500">No path found from selected roots.</div>
        ) : (
          paths.map((p, idx) => (
            <div key={`${p.rootId}-${idx}`} className="border border-gray-200 rounded p-3">
              <div className="text-xs text-gray-500 mb-2">
                Root: <span className="font-medium text-gray-800">{dag.nodesById.get(p.rootId)?.name || p.rootId}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.path.map((id, i) => (
                  <button
                    key={id + i}
                    className="text-xs px-2 py-1 rounded bg-gray-50 border border-gray-200 hover:bg-gray-100"
                    onClick={() => setSelectedNodeId(id)}
                    title={id}
                  >
                    {dag.nodesById.get(id)?.name || id}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}

        <div className="text-xs text-gray-500">
          MVP: one shortest path per root (cap: {filters.maxPaths}).
        </div>
      </div>
    </div>
  );
};
