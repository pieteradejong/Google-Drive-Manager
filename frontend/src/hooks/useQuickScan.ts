/** Hook for quick scan (overview + top folders) using TanStack Query */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { QuickScanResponse } from '../types/drive';

export const useQuickScan = () => {
  const queryClient = useQueryClient();

  // Query for quick scan data - enable on mount to load cached data
  const {
    data,
    isLoading,
    error,
    isFetching,
    dataUpdatedAt
  } = useQuery<QuickScanResponse, Error>({
    queryKey: ['quickScan'],
    queryFn: () => api.quickScan(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 60 * 60 * 1000, // 1 hour
    enabled: true, // Load cached data on mount
    refetchOnMount: false, // Don't refetch if we have cached data
  });

  // Mutation to trigger scan
  const scanMutation = useMutation({
    mutationFn: () => api.quickScan(),
    onSuccess: (data) => {
      // Update query cache with new data
      queryClient.setQueryData(['quickScan'], data);
    },
  });

  const scan = async () => {
    return scanMutation.mutateAsync();
  };

  return {
    data: data || null,
    isLoading: isLoading || scanMutation.isLoading || isFetching,
    error: error || scanMutation.error,
    scan,
    dataUpdatedAt, // For cache status indicators
  };
};
