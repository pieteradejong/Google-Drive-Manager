/** Hook for full scan with progress tracking */
import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import type { FullScanStatusResponse, ScanResponse } from '../types/drive';

export const useFullScan = () => {
  const [scanId, setScanId] = useState<string | null>(null);
  const [progress, setProgress] = useState<FullScanStatusResponse | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  const startScan = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setProgress(null);
    
    try {
      const { scan_id } = await api.startFullScan();
      setScanId(scan_id);
      
      // Start polling for progress
      pollStatus(scan_id);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setIsLoading(false);
      throw error;
    }
  };

  const pollStatus = async (id: string) => {
    const poll = async () => {
      try {
        const status = await api.getFullScanStatus(id);
        setProgress(status);
        
        if (status.status === 'complete' && status.result) {
          setResult(status.result);
          setIsLoading(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        } else if (status.status === 'error') {
          setError(new Error(status.progress.message || 'Scan failed'));
          setIsLoading(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setIsLoading(false);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    };

    // Poll immediately, then every 2 seconds
    poll();
    pollingIntervalRef.current = window.setInterval(poll, 2000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return { 
    scanId, 
    progress, 
    result, 
    isLoading, 
    error, 
    startScan 
  };
};
