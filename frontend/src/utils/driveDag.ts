/** Build a Drive DAG (folders + files) from full-scan items.
 *
 * Google Drive items can have multiple parents, so the directory “tree” is a DAG.
 */
import type { FileItem } from '../types/drive';

export interface DagEdge {
  from: string; // parent
  to: string; // child
}

export interface DagNode {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  parents: string[]; // all parent ids from dataset (may include missing)
  children: string[]; // only children present in dataset
  file: FileItem;
}

export interface DagWarnings {
  missingParentRefs: number;
  duplicateEdges: number;
  cycleDetected: boolean;
  cycleNodeCount: number;
  notes: string[];
}

export interface DriveDag {
  nodesById: Map<string, DagNode>;
  edges: DagEdge[];
  childrenById: Map<string, string[]>;
  parentsById: Map<string, string[]>;
  roots: string[];
  topoOrder: string[];
  depthById: Map<string, number>;
  maxDepth: number;
  warnings: DagWarnings;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface DagTraversalCaps {
  /** Maximum unique nodes to visit before truncating. */
  maxNodes?: number;
  /** Maximum edges to include in returned subgraph before truncating. */
  maxEdges?: number;
  /** Optional depth limit for traversals (edges traversed). */
  maxHops?: number;
}

export interface DagSubgraphResult {
  nodeIds: Set<string>;
  edges: DagEdge[];
  truncated: boolean;
  visitedNodes: number;
  includedEdges: number;
}

export interface DagReachableResult {
  reachable: Set<string>;
  truncated: boolean;
  visitedNodes: number;
}

export interface DagDescendantsResult {
  descendantCount: number;
  truncated: boolean;
  visitedNodes: number;
}

export function buildDriveDag(files: FileItem[]): DriveDag {
  const fileById = new Map<string, FileItem>();
  for (const f of files) fileById.set(f.id, f);

  // Build nodes with mutable adjacency sets first
  const childrenSets = new Map<string, Set<string>>();
  const parentsSets = new Map<string, Set<string>>();
  const nodesById = new Map<string, DagNode>();

  for (const f of files) {
    childrenSets.set(f.id, new Set());
    parentsSets.set(f.id, new Set(f.parents || []));
    nodesById.set(f.id, {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isFolder: f.mimeType === FOLDER_MIME,
      parents: [...(f.parents || [])],
      children: [],
      file: f,
    });
  }

  // Build edges from parent relationships
  const edges: DagEdge[] = [];
  const edgeKeySet = new Set<string>();
  let missingParentRefs = 0;
  let duplicateEdges = 0;

  for (const f of files) {
    const childId = f.id;
    const parents = f.parents || [];

    for (const parentId of parents) {
      if (!fileById.has(parentId)) {
        missingParentRefs++;
        continue;
      }

      const key = `${parentId}->${childId}`;
      if (edgeKeySet.has(key)) {
        duplicateEdges++;
        continue;
      }
      edgeKeySet.add(key);

      edges.push({ from: parentId, to: childId });
      childrenSets.get(parentId)!.add(childId);
    }
  }

  // Materialize adjacency maps
  const childrenById = new Map<string, string[]>();
  const parentsById = new Map<string, string[]>();

  for (const [id, set] of childrenSets) {
    childrenById.set(id, [...set]);
  }

  // parentsById should only include parents that exist in this dataset
  for (const [id, set] of parentsSets) {
    const filtered = [...set].filter((p) => fileById.has(p));
    parentsById.set(id, filtered);
  }

  // Populate children arrays on nodes
  for (const [id, node] of nodesById) {
    node.children = childrenById.get(id) || [];
  }

  // Roots: items with no known parents in dataset
  const roots: string[] = [];
  for (const id of nodesById.keys()) {
    const knownParents = parentsById.get(id) || [];
    if (knownParents.length === 0) roots.push(id);
  }

  // Topological order (Kahn). If cycles exist, we still produce a best-effort order.
  const indegree = new Map<string, number>();
  for (const id of nodesById.keys()) indegree.set(id, 0);
  for (const e of edges) indegree.set(e.to, (indegree.get(e.to) || 0) + 1);

  const queue: string[] = [];
  for (const [id, d] of indegree) {
    if (d === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  const localIndegree = new Map(indegree);

  while (queue.length > 0) {
    const n = queue.shift()!;
    topoOrder.push(n);

    const kids = childrenById.get(n) || [];
    for (const k of kids) {
      const next = (localIndegree.get(k) || 0) - 1;
      localIndegree.set(k, next);
      if (next === 0) queue.push(k);
    }
  }

  const cycleDetected = topoOrder.length !== nodesById.size;
  const cycleNodes: string[] = [];
  if (cycleDetected) {
    for (const [id, d] of localIndegree) {
      if (d > 0) cycleNodes.push(id);
    }
    // Append remaining nodes for a stable best-effort order.
    topoOrder.push(...cycleNodes);
  }

  // Depth computation: longest-path depth from any root using topo order.
  const depthById = new Map<string, number>();
  for (const id of nodesById.keys()) depthById.set(id, 0);

  // Ensure roots start at 0 (already). Process topo order.
  for (const id of topoOrder) {
    const d = depthById.get(id) || 0;
    for (const child of childrenById.get(id) || []) {
      const prev = depthById.get(child) || 0;
      const next = d + 1;
      if (next > prev) depthById.set(child, next);
    }
  }

  let maxDepth = 0;
  for (const d of depthById.values()) maxDepth = Math.max(maxDepth, d);

  const notes: string[] = [];
  if (missingParentRefs > 0) {
    notes.push(`Missing parent references: ${missingParentRefs.toLocaleString()}`);
  }
  if (duplicateEdges > 0) {
    notes.push(`Duplicate edges ignored: ${duplicateEdges.toLocaleString()}`);
  }
  if (cycleDetected) {
    notes.push(`Cycle detected: ${cycleNodes.length.toLocaleString()} nodes involved (best-effort ordering used)`);
  }

  const warnings: DagWarnings = {
    missingParentRefs,
    duplicateEdges,
    cycleDetected,
    cycleNodeCount: cycleNodes.length,
    notes,
  };

  return {
    nodesById,
    edges,
    childrenById,
    parentsById,
    roots,
    topoOrder,
    depthById,
    maxDepth,
    warnings,
  };
}

export function getNodeSizeBytes(file: FileItem): number {
  return file.calculatedSize ?? file.size ?? 0;
}

export function getMultiParentIds(dag: DriveDag): string[] {
  const ids: string[] = [];
  for (const [id, parents] of dag.parentsById) {
    if ((parents?.length || 0) > 1) ids.push(id);
  }
  return ids;
}

export function reachableFromRoots(
  dag: DriveDag,
  rootIds: string[],
  caps: DagTraversalCaps = {}
): DagReachableResult {
  const maxNodes = caps.maxNodes ?? 50_000;
  const maxHops = caps.maxHops ?? Infinity;

  const reachable = new Set<string>();
  const queue: Array<{ id: string; hops: number }> = [];

  for (const r of rootIds) {
    if (!dag.nodesById.has(r)) continue;
    if (reachable.has(r)) continue;
    reachable.add(r);
    queue.push({ id: r, hops: 0 });
    if (reachable.size >= maxNodes) {
      return { reachable, truncated: true, visitedNodes: reachable.size };
    }
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.hops >= maxHops) continue;

    const children = dag.childrenById.get(cur.id) || [];
    for (const child of children) {
      if (reachable.has(child)) continue;
      reachable.add(child);
      if (reachable.size >= maxNodes) {
        return { reachable, truncated: true, visitedNodes: reachable.size };
      }
      queue.push({ id: child, hops: cur.hops + 1 });
    }
  }

  return { reachable, truncated: false, visitedNodes: reachable.size };
}

/** Undirected, hop-limited neighborhood around a node, returning directed edges within the neighborhood. */
export function getSubgraphAround(
  dag: DriveDag,
  centerId: string,
  hops: number,
  caps: DagTraversalCaps = {}
): DagSubgraphResult {
  const maxNodes = caps.maxNodes ?? 2_000;
  const maxEdges = caps.maxEdges ?? 5_000;
  const maxHops = Math.min(hops, caps.maxHops ?? hops);

  const nodeIds = new Set<string>();
  const queue: Array<{ id: string; hops: number }> = [];
  let truncated = false;

  if (!dag.nodesById.has(centerId)) {
    return { nodeIds, edges: [], truncated: false, visitedNodes: 0, includedEdges: 0 };
  }

  nodeIds.add(centerId);
  queue.push({ id: centerId, hops: 0 });

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.hops >= maxHops) continue;

    const neighbors = new Set<string>();
    for (const p of dag.parentsById.get(cur.id) || []) neighbors.add(p);
    for (const c of dag.childrenById.get(cur.id) || []) neighbors.add(c);

    for (const n of neighbors) {
      if (!dag.nodesById.has(n)) continue;
      if (nodeIds.has(n)) continue;
      nodeIds.add(n);
      if (nodeIds.size >= maxNodes) {
        truncated = true;
        queue.length = 0;
        break;
      }
      queue.push({ id: n, hops: cur.hops + 1 });
    }
  }

  const edges: DagEdge[] = [];
  for (const e of dag.edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    edges.push(e);
    if (edges.length >= maxEdges) {
      truncated = true;
      break;
    }
  }

  return {
    nodeIds,
    edges,
    truncated,
    visitedNodes: nodeIds.size,
    includedEdges: edges.length,
  };
}

/** Count descendants by capped BFS (directed) from startId. */
export function countDescendants(
  dag: DriveDag,
  startId: string,
  caps: DagTraversalCaps = {}
): DagDescendantsResult {
  const maxNodes = caps.maxNodes ?? 10_000;
  const maxHops = caps.maxHops ?? Infinity;

  if (!dag.nodesById.has(startId)) {
    return { descendantCount: 0, truncated: false, visitedNodes: 0 };
  }

  const visited = new Set<string>();
  const queue: Array<{ id: string; hops: number }> = [];

  visited.add(startId);
  queue.push({ id: startId, hops: 0 });

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.hops >= maxHops) continue;

    for (const child of dag.childrenById.get(cur.id) || []) {
      if (visited.has(child)) continue;
      visited.add(child);
      if (visited.size >= maxNodes) {
        // visited includes start node; descendants = visited-1
        return { descendantCount: Math.max(0, visited.size - 1), truncated: true, visitedNodes: visited.size };
      }
      queue.push({ id: child, hops: cur.hops + 1 });
    }
  }

  return { descendantCount: Math.max(0, visited.size - 1), truncated: false, visitedNodes: visited.size };
}
