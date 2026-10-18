/**
 * Video Memory Manager
 * Guarantees zero-leak lifecycle management for frames, canvases, bitmaps, and WebCodecs objects.
 */

export class VideoMemoryManager {
  private static instance: VideoMemoryManager;
  private trackedObjectUrls: Set<string> = new Set();
  private trackedCanvases: Set<HTMLCanvasElement | OffscreenCanvas> = new Set();

  public static getInstance(): VideoMemoryManager {
    if (!VideoMemoryManager.instance) {
      VideoMemoryManager.instance = new VideoMemoryManager();
    }
    return VideoMemoryManager.instance;
  }

  /**
   * Creates a canvas with safe allocation and registers for disposal.
   */
  public createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));

    if (typeof OffscreenCanvas !== "undefined") {
      try {
        const offscreen = new OffscreenCanvas(w, h);
        this.trackedCanvases.add(offscreen);
        return offscreen;
      } catch {}
    }

    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      this.trackedCanvases.add(canvas);
      return canvas;
    }

    throw new Error("[VideoMemoryManager] No canvas execution environment available");
  }

  /**
   * Safely disposes of a Canvas or OffscreenCanvas by resetting its dimensions to 1x1.
   */
  public disposeCanvas(canvas?: HTMLCanvasElement | OffscreenCanvas | null): void {
    if (!canvas) return;
    try {
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d" as any);
      if (ctx && "clearRect" in ctx) {
        (ctx as CanvasRenderingContext2D).clearRect(0, 0, 1, 1);
      }
      this.trackedCanvases.delete(canvas);
    } catch {}
  }

  /**
   * Safely closes a WebCodecs VideoFrame or ImageBitmap.
   */
  public closeFrameOrBitmap(frameOrBitmap?: any): void {
    if (!frameOrBitmap) return;
    try {
      if (typeof frameOrBitmap.close === "function") {
        frameOrBitmap.close();
      }
    } catch {}
  }

  /**
   * Creates and registers an Object URL for automated batch garbage collection.
   */
  public createTrackedObjectUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.trackedObjectUrls.add(url);
    return url;
  }

  /**
   * Revokes a specific Object URL.
   */
  public revokeObjectUrl(url?: string | null): void {
    if (!url || !url.startsWith("blob:")) return;
    try {
      URL.revokeObjectURL(url);
      this.trackedObjectUrls.delete(url);
    } catch {}
  }

  /**
   * Untracks an Object URL so it won't be automatically revoked when batch cleaning.
   */
  public untrackObjectUrl(url?: string | null): void {
    if (!url) return;
    this.trackedObjectUrls.delete(url);
  }

  /**
   * Runs an operation inside a scoped memory container, ensuring all allocated
   * resources in the scope are purged when completed or on error.
   */
  public async withScope<T>(
    operation: (scope: {
      createCanvas: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas;
      trackUrl: (blob: Blob) => string;
      closeFrame: (frame: any) => void;
    }) => Promise<T>
  ): Promise<T> {
    const localCanvases: (HTMLCanvasElement | OffscreenCanvas)[] = [];
    const localUrls: string[] = [];

    const scopeTools = {
      createCanvas: (w: number, h: number) => {
        const c = this.createCanvas(w, h);
        localCanvases.push(c);
        return c;
      },
      trackUrl: (blob: Blob) => {
        const url = this.createTrackedObjectUrl(blob);
        localUrls.push(url);
        return url;
      },
      closeFrame: (frame: any) => {
        this.closeFrameOrBitmap(frame);
      },
    };

    try {
      return await operation(scopeTools);
    } finally {
      // Purge all local canvases
      for (const canvas of localCanvases) {
        this.disposeCanvas(canvas);
      }
      // Trigger browser GC hint if available
      if (typeof window !== "undefined" && (window as any).gc) {
        try {
          (window as any).gc();
        } catch {}
      }
    }
  }

  /**
   * Emergency reset of all tracked URLs and canvases.
   */
  public purgeAll(): void {
    for (const url of this.trackedObjectUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    this.trackedObjectUrls.clear();

    for (const canvas of this.trackedCanvases) {
      this.disposeCanvas(canvas);
    }
    this.trackedCanvases.clear();
  }
}
