/** Hook for quick scan (overview + top folders) using TanStack Query */
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { QuickScanResponse } from '../types/drive';

export interface ScanTiming {
  startTime: number | null;
  duration: number | null; // in milliseconds
  isSlow: boolean; // true if > 3 seconds
}

export const useQuickScan = () => {
  const queryClient = useQueryClient();
  const [timing, setTiming] = useState<ScanTiming>({
    startTime: null,
    duration: null,
    isSlow: false,
  });
  const startTimeRef = useRef<number | null>(null);

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
    mutationFn: async () => {
      const startTime = performance.now();
      startTimeRef.current = startTime;
      setTiming({
        startTime,
        duration: null,
        isSlow: false,
      });
      
      try {
        const result = await api.quickScan();
        const duration = performance.now() - startTime;
        setTiming({
          startTime,
          duration,
          isSlow: duration > 3000, // Mark as slow if > 3 seconds
        });
        return result;
      } catch (error) {
        const duration = performance.now() - startTime;
        setTiming({
          startTime,
          duration,
          isSlow: true, // Errors are always considered slow
        });
        throw error;
      }
    },
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
    timing, // Performance timing information
  };
};
