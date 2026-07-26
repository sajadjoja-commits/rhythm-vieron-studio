import { useEffect, useRef, useCallback } from 'react';

/**
 * Performance optimization hook for managing memory and reducing re-renders
 * Particularly useful for AI-heavy operations like Whisper transcription
 */
export const usePerformanceOptimization = () => {
  const memoryWarningShown = useRef(false);

  // Monitor memory usage and warn if approaching limits
  useEffect(() => {
    const checkMemory = () => {
      if (navigator.deviceMemory) {
        const availableMemory = navigator.deviceMemory;
        
        // If device has less than 4GB, show warning
        if (availableMemory < 4 && !memoryWarningShown.current) {
          console.warn(`⚠️ Low device memory detected: ${availableMemory}GB. AI processing may be slower.`);
          memoryWarningShown.current = true;
        }
      }

      // Check performance metrics
      if (performance.memory) {
        const usagePercent = (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;
        if (usagePercent > 85) {
          console.warn(`⚠️ High memory usage: ${usagePercent.toFixed(1)}%. Consider closing other apps.`);
        }
      }
    };

    checkMemory();
    const interval = setInterval(checkMemory, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Cleanup function for large objects
  const cleanupMemory = useCallback(async () => {
    if (typeof window !== 'undefined' && 'gc' in window) {
      try {
        // @ts-expect-error - gc is only available in dev/debug mode
        window.gc();
        console.log('✓ Garbage collection triggered');
      } catch (e) {
        console.debug('GC not available (normal in production)');
      }
    }
  }, []);

  return { cleanupMemory };
};

/**
 * Debounce hook for performance-critical operations
 */
export const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = require('react').useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Memoization hook for expensive computations
 */
export const useMemoCompute = <T,>(
  computeFn: () => T,
  dependencies: any[],
  shouldUpdate?: () => boolean
) => {
  const cachedValue = useRef<T | null>(null);
  const cachedDeps = useRef<any[]>([]);

  const depsChanged = dependencies.length !== cachedDeps.current.length ||
    dependencies.some((dep, i) => dep !== cachedDeps.current[i]);

  if (depsChanged || (shouldUpdate && shouldUpdate())) {
    cachedValue.current = computeFn();
    cachedDeps.current = dependencies;
  }

  return cachedValue.current;
};
