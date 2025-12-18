import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export type AnalyticsStatus =
  | { status: 'missing' | 'running' | 'ready' | 'error'; [key: string]: any }
  | any;

export function useAnalyticsStatus(enabled: boolean = true) {
  return useQuery({
    queryKey: ['analytics', 'status'],
    queryFn: () => api.getAnalyticsStatus(),
    enabled,
    staleTime: 60_000,
    refetchInterval: (query) => {
      const data: any = query.state.data;
      if (!data) return 10_000;
      return data.status === 'running' ? 2_000 : false;
    }
  });
}

export function useStartAnalytics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.startAnalytics(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics', 'status'] });
    }
  });
}

export function useAnalyticsView(view: string | null, params?: Record<string, any>, enabled: boolean = true) {
  const statusQuery = useAnalyticsStatus(enabled);
  const isReady = (statusQuery.data as any)?.status === 'ready';

  return useQuery({
    queryKey: ['analytics', 'view', view, params, (statusQuery.data as any)?.computed_at, (statusQuery.data as any)?.derived_version],
    queryFn: async () => {
      if (!view) throw new Error('No analytics view specified');
      return api.getAnalyticsView(view, params);
    },
    enabled: Boolean(enabled && view && isReady),
    staleTime: 30 * 60_000, // 30 minutes (analytics keyed to full scan cache)
  });
}

/** Convenience hook to ensure analytics starts once a full scan is available. */
export function useEnsureAnalyticsStarted(shouldStart: boolean) {
  const status = useAnalyticsStatus(shouldStart);
  const start = useStartAnalytics();
  const startedOnceRef = useRef(false);

  useEffect(() => {
    if (!shouldStart) return;
    const s = (status.data as any)?.status;
    if (start.isPending) return;
    if (s === 'running' || s === 'ready') return;
    if (startedOnceRef.current) return;
    if (!s || s === 'missing' || s === 'error') {
      // Fire-and-forget; status query will poll if running
      startedOnceRef.current = true;
      start.mutate();
    }
  // start.isPending and start.mutate are stable refs from React Query
  }, [shouldStart, status.data, start.isPending, start.mutate]);

  return { status, start };
}

