/** Hook for quick scan (overview + top folders) */
import { useState } from 'react';
import { api } from '../api/client';
import type { QuickScanResponse } from '../types/drive';

export const useQuickScan = () => {
  const [data, setData] = useState<QuickScanResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const scan = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.quickScan();
      setData(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { data, isLoading, error, scan };
};
