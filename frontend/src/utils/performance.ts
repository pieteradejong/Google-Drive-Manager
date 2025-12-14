/** Performance monitoring utilities for frontend operations */

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  FRAME_TIME: 16, // 60fps = 16ms per frame
  NOTICEABLE: 100, // User notices delay
  SLOW: 500, // Definitely slow
  VERY_SLOW: 1000, // Very slow operation
} as const;

/**
 * Measure async operation duration and log if slow
 */
export async function measureAsync<T>(
  operationName: string,
  operation: () => Promise<T>,
  warnThreshold: number = THRESHOLDS.NOTICEABLE
): Promise<T> {
  const startMark = `${operationName}-start`;
  const endMark = `${operationName}-end`;
  const measureName = operationName;

  // Performance mark start
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(startMark);
  }

  const startTime = performance.now();

  try {
    const result = await operation();
    const duration = performance.now() - startTime;

    // Performance mark end
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(endMark);
      try {
        performance.measure(measureName, startMark, endMark);
      } catch (e) {
        // Measure might already exist, ignore
      }
    }

    // Log based on duration
    if (duration > THRESHOLDS.VERY_SLOW) {
      console.error(
        `[Performance] ${operationName} took ${duration.toFixed(2)}ms (VERY SLOW)`
      );
    } else if (duration > warnThreshold) {
      console.warn(
        `[Performance] ${operationName} took ${duration.toFixed(2)}ms (SLOW)`
      );
    } else if (duration > THRESHOLDS.FRAME_TIME) {
      console.log(
        `[Performance] ${operationName} took ${duration.toFixed(2)}ms`
      );
    }

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(
      `[Performance] ${operationName} failed after ${duration.toFixed(2)}ms:`,
      error
    );
    throw error;
  }
}

/**
 * Measure synchronous operation duration
 */
export function measureSync<T>(
  operationName: string,
  operation: () => T,
  warnThreshold: number = THRESHOLDS.NOTICEABLE
): T {
  const startMark = `${operationName}-start`;
  const endMark = `${operationName}-end`;
  const measureName = operationName;

  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(startMark);
  }

  const startTime = performance.now();

  try {
    const result = operation();
    const duration = performance.now() - startTime;

    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(endMark);
      try {
        performance.measure(measureName, startMark, endMark);
      } catch (e) {
        // Measure might already exist, ignore
      }
    }

    // Log based on duration
    if (duration > THRESHOLDS.VERY_SLOW) {
      console.error(
        `[Performance] ${operationName} took ${duration.toFixed(2)}ms (VERY SLOW - may freeze UI)`
      );
    } else if (duration > warnThreshold) {
      console.warn(
        `[Performance] ${operationName} took ${duration.toFixed(2)}ms (SLOW - may cause frame drops)`
      );
    } else if (duration > THRESHOLDS.FRAME_TIME) {
      console.log(
        `[Performance] ${operationName} took ${duration.toFixed(2)}ms (consider optimizing)`
      );
    }

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(
      `[Performance] ${operationName} failed after ${duration.toFixed(2)}ms:`,
      error
    );
    throw error;
  }
}

/**
 * React hook to measure component render time
 * Usage: usePerformanceMeasure('ComponentName'); at top of component
 */
export function usePerformanceMeasure(componentName: string): void {
  if (typeof window === 'undefined') return; // SSR safety

  const startMark = `${componentName}-render-start`;
  const endMark = `${componentName}-render-end`;
  const measureName = `${componentName}-render`;

  // Mark render start (call this in useEffect or useLayoutEffect)
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(startMark);

    // Use requestIdleCallback or setTimeout to mark end after render
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        performance.mark(endMark);
        try {
          const measure = performance.measure(measureName, startMark, endMark);
          const duration = measure.duration;
          
          if (duration > THRESHOLDS.FRAME_TIME) {
            console.warn(
              `[Performance] ${componentName} render took ${duration.toFixed(2)}ms (may cause frame drops)`
            );
          }
        } catch (e) {
          // Measure might already exist
        }
      });
    } else {
      setTimeout(() => {
        performance.mark(endMark);
        try {
          const measure = performance.measure(measureName, startMark, endMark);
          const duration = measure.duration;
          
          if (duration > THRESHOLDS.FRAME_TIME) {
            console.warn(
              `[Performance] ${componentName} render took ${duration.toFixed(2)}ms (may cause frame drops)`
            );
          }
        } catch (e) {
          // Measure might already exist
        }
      }, 0);
    }
  }
}

/**
 * Create a performance mark (for manual timing)
 */
export function mark(name: string): void {
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(name);
  }
}

/**
 * Measure between two marks
 */
export function measure(measureName: string, startMark: string, endMark: string): number | null {
  if (typeof performance === 'undefined' || !performance.measure) {
    return null;
  }

  try {
    const measure = performance.measure(measureName, startMark, endMark);
    return measure.duration;
  } catch (e) {
    return null;
  }
}

/**
 * Get all performance measures for a given name (useful for debugging)
 */
export function getMeasures(measureName: string): PerformanceEntry[] {
  if (typeof performance === 'undefined' || !performance.getEntriesByName) {
    return [];
  }

  return performance.getEntriesByName(measureName, 'measure');
}

/**
 * Clear all performance marks and measures (useful for cleanup)
 */
export function clearPerformanceMarks(prefix?: string): void {
  if (typeof performance === 'undefined' || !performance.clearMarks) {
    return;
  }

  if (prefix) {
    // Clear marks with prefix
    const entries = performance.getEntriesByType('mark');
    entries.forEach((entry) => {
      if (entry.name.startsWith(prefix)) {
        performance.clearMarks(entry.name);
      }
    });
  } else {
    performance.clearMarks();
  }
}
