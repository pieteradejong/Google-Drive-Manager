/** Hook for full scan with progress tracking using TanStack Query */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { FullScanStatusResponse, ScanResponse } from '../types/drive';

export const useFullScan = () => {
  const queryClient = useQueryClient();

  // Check for cached full scan result in query client
  const cachedResult = queryClient.getQueryData<ScanResponse>(['fullScanResult']);

  // Mutation to start a scan
  const startScanMutation = useMutation({
    mutationFn: () => api.startFullScan(),
    onSuccess: (data) => {
      // Invalidate any existing scan status queries
      queryClient.invalidateQueries({ queryKey: ['fullScan', data.scan_id] });
    },
  });

  const scanId = startScanMutation.data?.scan_id || null;

  // Query to poll scan status (only when scanId exists)
  const {
    data: progress,
    isLoading: isPolling,
    error: pollError,
    dataUpdatedAt
  } = useQuery<FullScanStatusResponse, Error>({
    queryKey: ['fullScan', scanId],
    queryFn: () => api.getFullScanStatus(scanId!),
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
    cacheTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  // Extract result from progress or cached data
  const result = progress?.result || cachedResult || null;

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
    isLoading: startScanMutation.isLoading || isPolling,
    error: startScanMutation.error || pollError || null,
    startScan,
    dataUpdatedAt, // For cache status indicators
  };
};
