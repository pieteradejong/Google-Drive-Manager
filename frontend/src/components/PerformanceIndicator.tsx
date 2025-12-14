/** Performance indicator component showing timing and latency information */
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ScanTiming as QuickScanTiming } from '../hooks/useQuickScan';
import type { ScanTiming as FullScanTiming } from '../hooks/useFullScan';

type ScanTiming = QuickScanTiming | FullScanTiming;

interface PerformanceIndicatorProps {
  timing: ScanTiming;
  operationName: string;
  isRunning?: boolean;
  className?: string;
}

export const PerformanceIndicator = ({ 
  timing, 
  operationName,
  isRunning = false,
  className = ''
}: PerformanceIndicatorProps) => {
  const formatDuration = (ms: number | null): string => {
    if (ms === null) return '';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const formatEstimated = (ms: number | null): string => {
    if (ms === null) return '';
    if (ms < 60000) return `~${Math.round(ms / 1000)}s remaining`;
    const minutes = Math.floor(ms / 60000);
    return `~${minutes}m remaining`;
  };

  // Don't show anything if no timing data
  if (!timing.startTime && !timing.duration) {
    return null;
  }

  const isSlow = timing.isSlow;
  const hasDuration = timing.duration !== null;
  const estimatedRemaining = 'estimatedRemaining' in timing ? timing.estimatedRemaining : null;
  const showEstimate = isRunning && estimatedRemaining !== null && !hasDuration;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {isRunning ? (
        <>
          <Clock size={12} className="text-blue-500 animate-pulse" />
          <span className={isSlow ? 'text-amber-600 font-medium' : 'text-gray-600'}>
            {timing.startTime && (
              <>
                {formatDuration(performance.now() - timing.startTime)}
                {showEstimate && estimatedRemaining !== null && ` (${formatEstimated(estimatedRemaining)})`}
              </>
            )}
          </span>
        </>
      ) : hasDuration ? (
        <>
          {isSlow ? (
            <AlertTriangle size={12} className="text-amber-600" />
          ) : (
            <CheckCircle2 size={12} className="text-green-600" />
          )}
          <span className={isSlow ? 'text-amber-600 font-medium' : 'text-gray-600'}>
            {formatDuration(timing.duration)}
            {isSlow && ' (slow)'}
          </span>
        </>
      ) : null}
    </span>
  );
};
