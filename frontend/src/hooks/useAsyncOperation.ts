/** Hook for tracking async operations with loading states */
import { useState, useCallback, useEffect } from 'react';

export interface OperationState {
  isRunning: boolean;
  operation: string | null;
  details: string | null;
  progress: number | null; // 0-100
  error: Error | null;
}

export function useAsyncOperation() {
  const [state, setState] = useState<OperationState>({
    isRunning: false,
    operation: null,
    details: null,
    progress: null,
    error: null,
  });

  const startOperation = useCallback((operation: string, details?: string) => {
    setState({
      isRunning: true,
      operation,
      details: details || null,
      progress: null,
      error: null,
    });
  }, []);

  const updateProgress = useCallback((progress: number, details?: string) => {
    setState(prev => ({
      ...prev,
      progress,
      details: details || prev.details,
    }));
  }, []);

  const updateDetails = useCallback((details: string) => {
    setState(prev => ({
      ...prev,
      details,
    }));
  }, []);

  const completeOperation = useCallback(() => {
    setState({
      isRunning: false,
      operation: null,
      details: null,
      progress: null,
      error: null,
    });
  }, []);

  const setError = useCallback((error: Error) => {
    setState({
      isRunning: false,
      operation: null,
      details: null,
      progress: null,
      error,
    });
  }, []);

  return {
    state,
    startOperation,
    updateProgress,
    updateDetails,
    completeOperation,
    setError,
  };
}

/**
 * Hook to break up heavy synchronous work into chunks
 * Allows UI to update between chunks
 */
export function useChunkedWork<T>(
  workFn: () => T,
  chunkSize: number = 100,
  operationName: string = 'Processing'
): { result: T | null; isProcessing: boolean; progress: number; operation: string } {
  const [result, setResult] = useState<T | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [progress, setProgress] = useState(0);
  const [operation, setOperation] = useState(operationName);

  useEffect(() => {
    let cancelled = false;
    
    // For now, run synchronously but we'll enhance this
    // In a real implementation, we'd use requestIdleCallback or Web Workers
    const startTime = performance.now();
    
    try {
      const result = workFn();
      if (!cancelled) {
        const duration = performance.now() - startTime;
        if (duration > 100) {
          // Show brief loading state for operations >100ms
          setTimeout(() => {
            setResult(result);
            setIsProcessing(false);
            setProgress(100);
          }, 50);
        } else {
          setResult(result);
          setIsProcessing(false);
          setProgress(100);
        }
      }
    } catch (error) {
      if (!cancelled) {
        console.error('Error in chunked work:', error);
        setIsProcessing(false);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [workFn, chunkSize, operationName]);

  return { result, isProcessing, progress, operation };
}
