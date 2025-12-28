/** Hook for full scan with progress tracking using TanStack Query */
import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { logger } from '../utils/logger';
import type { FullScanCacheStatusResponse, FullScanStatusResponse, ScanResponse } from '../types/drive';

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

  // Fast cache status check (sidecar-first) to avoid loading huge cached payload on app load
  const {
    data: cacheStatus,
    isLoading: isCacheStatusLoading,
  } = useQuery({
    queryKey: ['fullScanCacheStatus'] as const,
    queryFn: async (): Promise<FullScanCacheStatusResponse> => api.getFullScanCacheStatus(),
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // keep for 10 minutes
    retry: 1,
    refetchOnMount: false,
  });

  // Load cached full scan immediately if cache exists (not waiting for validation)
  const shouldFetchCachedFullScan = cacheStatus?.exists === true;

  // Log cache status decision on startup
  useEffect(() => {
    if (cacheStatus !== undefined) {
      logger.info('startup', 'Full scan cache status check', {
        exists: cacheStatus?.exists,
        valid: cacheStatus?.valid,
        reason: cacheStatus?.reason,
        fileCount: cacheStatus?.file_count,
        willLoadFromCache: shouldFetchCachedFullScan,
      });
    }
  }, [cacheStatus, shouldFetchCachedFullScan]);

  // Load cached full scan data immediately when cache exists (even if TTL expired)
  const {
    data: cachedData,
    isLoading: isCacheLoading,
    dataUpdatedAt: cacheDataUpdatedAt,
  } = useQuery({
    queryKey: ['fullScanResult'] as const,
    queryFn: async (): Promise<ScanResponse | null> => api.getCachedFullScan(),
    staleTime: 30 * 60 * 1000, // 30 minutes - don't refetch if we have data
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
    retry: false, // Don't retry 404s
    refetchOnMount: false, // Don't refetch if we already have data
    enabled: shouldFetchCachedFullScan,
  });

  // Background validation query (runs when cache exists, especially if TTL expired)
  // Validate if: cache exists AND (cached data loaded OR TTL expired)
  const shouldValidateCache = cacheStatus?.exists === true && 
                              (cachedData !== undefined || cacheStatus?.reason === 'ttl_expired');
  
  const {
    data: validationStatus,
    isLoading: isValidatingCache,
  } = useQuery({
    queryKey: ['fullScanCacheValidation'] as const,
    queryFn: async (): Promise<FullScanCacheStatusResponse> => api.validateFullScanCache(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // Keep for 10 minutes
    retry: 1,
    refetchOnMount: false,
    enabled: shouldValidateCache,
  });

  // Check for cached full scan result in query client (fallback)
  const cachedResult = cachedData || queryClient.getQueryData<ScanResponse>(['fullScanResult']);

  // Log when cached data is loaded
  useEffect(() => {
    if (cachedData) {
      logger.info('startup', 'Full scan data loaded from cache', {
        fileCount: cachedData.stats?.total_files,
        folderCount: cachedData.stats?.folder_count,
        totalSize: cachedData.stats?.total_size,
        ttlValid: cacheStatus?.valid,
        reason: cacheStatus?.reason,
      });
    }
  }, [cachedData, cacheStatus]);

  // Determine cache warning message based on validation status
  const getCacheWarning = (): string | null => {
    if (!cacheStatus?.exists) {
      return null;
    }
    
    // If validation completed and cache is invalid
    if (validationStatus && !validationStatus.valid) {
      return 'Cache invalid - Drive has changed. Please run a new full scan.';
    }
    
    // If TTL expired but validation is still running
    if (cacheStatus.reason === 'ttl_expired' && isValidatingCache) {
      return 'Cache expired by TTL; validating against Drive...';
    }
    
    // If TTL expired and validation hasn't started yet
    if (cacheStatus.reason === 'ttl_expired' && !validationStatus) {
      return 'Cache expired by TTL; validating against Drive...';
    }
    
    return null;
  };

  const cacheWarning = getCacheWarning();

  // Mutation to start a scan
  const startScanMutation = useMutation({
    mutationFn: async () => {
      logger.info('scan', 'Starting full scan...');
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
      logger.info('scan', 'Full scan initiated', { scanId: result.scan_id });
      
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

  // Extract result from progress or cached data (prefer fresh scan result, fall back to cache)
  const result = progress?.result || cachedResult || null;
  
  // Use cache data timestamp if we loaded from cache, otherwise use poll timestamp
  const effectiveDataUpdatedAt = result === cachedResult ? cacheDataUpdatedAt : dataUpdatedAt;

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
      logger.info('scan', 'Full scan completed', {
        durationMs: Math.round(duration),
        durationFormatted: duration > 60000 
          ? `${(duration / 60000).toFixed(1)}m` 
          : `${(duration / 1000).toFixed(1)}s`,
        fileCount: progress.result?.stats?.total_files,
      });
      setTiming({
        startTime: startTimeRef.current,
        duration,
        estimatedRemaining: null,
        isSlow: duration > 120000, // Slow if > 2 minutes
      });
    } else if (progress?.status === 'error' && startTimeRef.current) {
      const duration = performance.now() - startTimeRef.current;
      logger.error('scan', 'Full scan failed', {
        durationMs: Math.round(duration),
        error: progress.error,
      });
      setTiming({
        startTime: startTimeRef.current,
        duration,
        estimatedRemaining: null,
        isSlow: true,
      });
    }
  // Intentionally watching specific nested properties for timing updates
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    isLoading:
      isCacheStatusLoading || isCacheLoading || startScanMutation.isPending || isPolling,
    error: startScanMutation.error || pollError || null,
    startScan,
    dataUpdatedAt: effectiveDataUpdatedAt, // For cache status indicators
    timing, // Performance timing information
    isFromCache: result === cachedResult && !progress?.result, // Indicates if showing cached data
    cacheStatus: cacheStatus || null,
    // Cache hydration progress flags
    isCheckingCacheStatus: isCacheStatusLoading,
    isLoadingCachedScan: isCacheLoading && shouldFetchCachedFullScan,
    isValidatingCache: isValidatingCache,
    cacheWarning, // Warning message if cache is invalid/expired
    cacheValidationStatus: validationStatus || null,
  };
};
