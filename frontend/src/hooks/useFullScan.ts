/** Hook for full scan with progress tracking using TanStack Query */
import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { FullScanStatusResponse, ScanResponse } from '../types/drive';

export interface ScanTiming {
  startTime: number | null;
  duration: number | null; // in milliseconds (only set when complete)
  estimatedRemaining: number | null; // in milliseconds
  isSlow: boolean;
}

export const useFullScan = () => {
  const queryClient = useQueryClient();
  const [timing, setTiming] = useState<ScanTiming>({
    startTime: null,
    duration: null,
    estimatedRemaining: null,
    isSlow: false,
  });
  const startTimeRef = useRef<number | null>(null);
  const lastProgressRef = useRef<number | null>(null);

  // Check for cached full scan result in query client
  const cachedResult = queryClient.getQueryData<ScanResponse>(['fullScanResult']);

  // Mutation to start a scan
  const startScanMutation = useMutation({
    mutationFn: async () => {
      const startTime = performance.now();
      startTimeRef.current = startTime;
      lastProgressRef.current = 0;
      setTiming({
        startTime,
        duration: null,
        estimatedRemaining: null,
        isSlow: false,
      });
      
      const result = await api.startFullScan();
      
      // Invalidate any existing scan status queries
      queryClient.invalidateQueries({ queryKey: ['fullScan', result.scan_id] });
      
      return result;
    },
  });

  const scanId = startScanMutation.data?.scan_id || null;

  // Query to poll scan status (only when scanId exists)
  const {
    data: progress,
    isLoading: isPolling,
    error: pollError,
    dataUpdatedAt
  } = useQuery({
    queryKey: ['fullScan', scanId] as const,
    queryFn: async (): Promise<FullScanStatusResponse> => api.getFullScanStatus(scanId!),
    enabled: !!scanId && startScanMutation.isSuccess,
    refetchInterval: (query) => {
      // Stop polling if scan is complete or error
      const status = query.state.data?.status;
      if (status === 'complete' || status === 'error') {
        return false;
      }
      return 2000; // Poll every 2 seconds
    },
    staleTime: 0, // Always consider stale for polling
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes (renamed from cacheTime in TanStack Query v5)
  });

  // Extract result from progress or cached data
  const result = progress?.result || cachedResult || null;

  // Update timing based on progress
  useEffect(() => {
    if (progress?.status === 'running' && progress.progress && startTimeRef.current) {
      const elapsed = performance.now() - startTimeRef.current;
      const currentProgress = progress.progress.progress || 0;
      
      // Estimate remaining time based on progress
      let estimatedRemaining: number | null = null;
      if (currentProgress > 0 && currentProgress < 100) {
        const estimatedTotal = elapsed / (currentProgress / 100);
        estimatedRemaining = estimatedTotal - elapsed;
      }
      
      setTiming({
        startTime: startTimeRef.current,
        duration: null,
        estimatedRemaining,
        isSlow: elapsed > 60000, // Slow if > 1 minute
      });
      
      lastProgressRef.current = currentProgress;
    } else if (progress?.status === 'complete' && startTimeRef.current) {
      const duration = performance.now() - startTimeRef.current;
      setTiming({
        startTime: startTimeRef.current,
        duration,
        estimatedRemaining: null,
        isSlow: duration > 120000, // Slow if > 2 minutes
      });
    } else if (progress?.status === 'error' && startTimeRef.current) {
      const duration = performance.now() - startTimeRef.current;
      setTiming({
        startTime: startTimeRef.current,
        duration,
        estimatedRemaining: null,
        isSlow: true,
      });
    }
  }, [progress?.status, progress?.progress?.progress]);

  // Cache the result when scan completes
  if (progress?.result && progress?.status === 'complete') {
    queryClient.setQueryData(['fullScanResult'], progress.result);
  }

  const startScan = async () => {
    return startScanMutation.mutateAsync();
  };

  return {
    scanId,
    progress: progress || null,
    result,
    isLoading: startScanMutation.isPending || isPolling,
    error: startScanMutation.error || pollError || null,
    startScan,
    dataUpdatedAt, // For cache status indicators
    timing, // Performance timing information
  };
};
