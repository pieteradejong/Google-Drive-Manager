/** TanStack Query hook for Drive scanning */
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ScanResponse } from '../types/drive';

export const useDriveScan = () => {
  return useQuery<ScanResponse>({
    queryKey: ['drive', 'scan'],
    queryFn: () => api.scan(),
    enabled: false, // Don't auto-fetch, require manual trigger
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};






