/**
 * Global Performance Optimizations for Rhythm Vieron Studio
 * Includes memory management, lazy loading, and rendering optimizations
 */

/**
 * Initialize performance monitoring and optimizations
 */
export const initializePerformanceOptimizations = () => {
  // 1. Enable Resource Hints
  if (typeof document !== 'undefined') {
    // Preconnect to CDN for faster resource loading
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = 'https://fonts.googleapis.com';
    document.head.appendChild(link);
  }

  // 2. Service Worker Caching Strategy
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((registration) => {
        console.log('✓ Service Worker active for offline support');
      }).catch((err) => {
        console.debug('Service Worker not available:', err);
      });
    }
  } catch (e) {}

  // 3. Optimize Image Loading
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            imageObserver.unobserve(img);
          }
        }
      });
    });

    document.querySelectorAll('img[data-src]').forEach((img) => {
      imageObserver.observe(img);
    });
  }

  // 4. Request Idle Callback for non-critical tasks
  const scheduleIdleTask = (callback: () => void) => {
    if ('requestIdleCallback' in window) {
      // @ts-expect-error - requestIdleCallback is not standard in lib.dom.d.ts
      requestIdleCallback(callback);
    } else {
      setTimeout(callback, 0);
    }
  };

  return { scheduleIdleTask };
};

/**
 * Optimize video processing memory usage
 */
export const optimizeVideoMemory = () => {
  // Reduce canvas size for preview
  const maxCanvasWidth = Math.min(window.innerWidth, 1280);
  const maxCanvasHeight = Math.min(window.innerHeight, 720);
  
  return { maxCanvasWidth, maxCanvasHeight };
};

/**
 * Batch DOM updates to reduce reflows
 */
export const batchDOMUpdates = (updates: Array<() => void>) => {
  requestAnimationFrame(() => {
    updates.forEach(update => update());
  });
};

/**
 * Lazy load heavy components
 */
export const createLazyComponent = async (componentPath: string) => {
  return import(/* webpackChunkName: "lazy-[request]" */ componentPath);
};

/**
 * Monitor and log performance metrics
 */
export const logPerformanceMetrics = () => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    const perfData = performance.timing;
    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
    const connectTime = perfData.responseEnd - perfData.requestStart;
    const renderTime = perfData.domComplete - perfData.domLoading;
    
    console.log('📊 Performance Metrics:');
    console.log(`  Page Load Time: ${pageLoadTime}ms`);
    console.log(`  Connect Time: ${connectTime}ms`);
    console.log(`  Render Time: ${renderTime}ms`);
    
    if (performance.memory) {
      console.log(`  Memory Used: ${(performance.memory.usedJSHeapSize / 1048576).toFixed(2)}MB`);
      console.log(`  Memory Limit: ${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(2)}MB`);
    }
  }
};

/**
 * Compress and optimize audio data before processing
 */
export const optimizeAudioData = (audioBuffer: ArrayBuffer, targetSampleRate: number = 16000) => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const sourceBuffer = audioContext.createBuffer(
    1,
    audioBuffer.byteLength / 2,
    audioContext.sampleRate
  );
  
  const channelData = sourceBuffer.getChannelData(0);
  const view = new Int16Array(audioBuffer);
  
  for (let i = 0; i < view.length; i++) {
    channelData[i] = view[i] / 32768.0;
  }
  
  return sourceBuffer;
};

/**
 * Clear unused caches to free memory
 */
export const clearUnusedCaches = async () => {
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      const cacheWhitelist = ['transformers-cache', 'app-cache-v1', 'vireon-pwa-cache-v3'];
      
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
      
      console.log('✓ Unused caches cleared');
    }
  } catch (error) {
    console.debug('Cache cleanup not available:', error);
  }
};

/**
 * Enable aggressive garbage collection hints
 */
export const enableGarbageCollectionHints = () => {
  // Schedule periodic cleanup
  setInterval(() => {
    if (typeof window !== 'undefined' && 'gc' in window) {
      try {
        // @ts-expect-error - gc is a non-standard browser debugging API
        window.gc();
      } catch (e) {
        // GC not available in production
      }
    }
  }, 60000); // Every minute
};
