/**
 * React hook for loading and managing the pre-computed DAG from the backend.
 *
 * This hook replaces client-side DAG computation with server-side pre-computed DAG,
 * providing faster load times and consistent data across components.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../api/client';
import type {
  DagResponse,
  DagStatusResponse,
} from '../types/drive';
import type { DriveDag, DagEdge, DagNode } from '../utils/driveDag';

// Query keys
const DAG_STATUS_KEY = ['dag', 'status'];
const DAG_DATA_KEY = ['dag', 'data'];

/** How often to refetch DAG status in background (5 minutes) */
const STATUS_STALE_TIME = 5 * 60 * 1000;

/** How often to refetch DAG data in background (10 minutes) */
const DAG_STALE_TIME = 10 * 60 * 1000;

/**
 * Hook to get DAG status without loading full data.
 *
 * Useful for checking if DAG exists and if it's stale.
 */
export function useDagStatus() {
  return useQuery<DagStatusResponse>({
    queryKey: DAG_STATUS_KEY,
    queryFn: () => api.getDagStatus(),
    staleTime: STATUS_STALE_TIME,
    gcTime: STATUS_STALE_TIME * 2,
  });
}

/**
 * Convert backend DagResponse to frontend DriveDag interface.
 *
 * This maintains compatibility with existing visualization components
 * that expect the DriveDag interface from buildDriveDag().
 */
function convertToDriveDag(response: DagResponse): DriveDag {
  // Build nodesById map
  const nodesById = new Map<string, DagNode>();
  const depthById = new Map<string, number>();

  for (const node of response.nodes) {
    const dagNode: DagNode = {
      id: node.id,
      name: node.name,
      mimeType: node.mimeType,
      isFolder: node.isFolder,
      ownedByMe: node.ownedByMe,
      parents: node.parents,
      children: node.children,
      // Reconstruct file object for compatibility
      file: {
        id: node.id,
        name: node.name,
        mimeType: node.mimeType,
        size: node.size,
        parents: node.parents,
        ownedByMe: node.ownedByMe,
      },
    };
    nodesById.set(node.id, dagNode);
    depthById.set(node.id, node.depth);
  }

  // Build childrenById and parentsById maps
  const childrenById = new Map<string, string[]>();
  const parentsById = new Map<string, string[]>();

  for (const node of response.nodes) {
    childrenById.set(node.id, node.children);
    parentsById.set(node.id, node.parents);
  }

  // Convert edges
  const edges: DagEdge[] = response.edges.map((e) => ({
    from: e.from,
    to: e.to,
  }));

  return {
    nodesById,
    edges,
    childrenById,
    parentsById,
    roots: response.roots,
    topoOrder: response.topoOrder,
    depthById,
    maxDepth: response.maxDepth,
    warnings: response.warnings,
    ownershipStats: response.ownershipStats,
  };
}

/**
 * Main hook to load the pre-computed DAG from backend.
 *
 * Returns a DriveDag interface compatible with existing visualization components.
 */
export function useDag() {
  const queryClient = useQueryClient();

  // Fetch DAG data
  const {
    data: dagResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<DagResponse | null>({
    queryKey: DAG_DATA_KEY,
    queryFn: () => api.getDag(),
    staleTime: DAG_STALE_TIME,
    gcTime: DAG_STALE_TIME * 2,
  });

  // Fetch DAG status (for staleness info)
  const { data: statusData } = useDagStatus();

  // Convert to DriveDag format
  const dag = useMemo<DriveDag | null>(() => {
    if (!dagResponse) return null;
    return convertToDriveDag(dagResponse);
  }, [dagResponse]);

  // Invalidate and refetch
  const invalidateAndRefetch = async () => {
    await queryClient.invalidateQueries({ queryKey: DAG_STATUS_KEY });
    await queryClient.invalidateQueries({ queryKey: DAG_DATA_KEY });
    await refetch();
  };

  // Trigger recomputation on server
  const recompute = async () => {
    await api.recomputeDag();
    await invalidateAndRefetch();
  };

  return {
    /** The DAG in DriveDag format (compatible with existing components) */
    dag,

    /** Raw response from backend (if needed) */
    rawResponse: dagResponse,

    /** Loading state */
    isLoading,

    /** Error state */
    isError,
    error,

    /** DAG status info */
    status: statusData,

    /** Whether DAG exists */
    exists: statusData?.exists ?? false,

    /** Whether DAG is stale (needs recomputation) */
    isStale: statusData?.is_stale ?? false,

    /** Node count */
    nodeCount: statusData?.node_count ?? dag?.nodesById.size ?? 0,

    /** Max depth */
    maxDepth: statusData?.max_depth ?? dag?.maxDepth ?? 0,

    /** When DAG was computed */
    computedAt: statusData?.computed_at,

    /** Refetch DAG from server */
    refetch,

    /** Invalidate cache and refetch */
    invalidate: invalidateAndRefetch,

    /** Trigger DAG recomputation on server */
    recompute,
  };
}

/**
 * Hook to get a single DAG node by ID.
 *
 * Useful for focused views that don't need the entire DAG.
 */
export function useDagNode(nodeId: string | null) {
  return useQuery({
    queryKey: ['dag', 'node', nodeId],
    queryFn: () => (nodeId ? api.getDagNode(nodeId) : null),
    enabled: !!nodeId,
    staleTime: DAG_STALE_TIME,
  });
}

export default useDag;
