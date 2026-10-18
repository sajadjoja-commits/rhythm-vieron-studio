/**
 * Non-destructive Image Version History Stack
 * Preserves original image + every accepted result with undo/redo.
 * Explicitly revokes abandoned object URLs (revokeObjectURL) on overwrite and destroy.
 */

export class ImageHistoryStack {
  private history: string[] = [];
  private currentIndex: number = -1;
  private trackedBlobUrls: Set<string> = new Set();

  constructor(initialUrl?: string) {
    if (initialUrl) {
      this.push(initialUrl);
    }
  }

  public get currentUrl(): string | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
      return this.history[this.currentIndex];
    }
    return null;
  }

  public get allVersions(): string[] {
    return [...this.history];
  }

  public get index(): number {
    return this.currentIndex;
  }

  public get canUndo(): boolean {
    return this.currentIndex > 0;
  }

  public get canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Pushes a new image version onto the stack.
   * If there are redo states ahead of the current index, they are pruned and their blob URLs revoked.
   */
  public push(url: string): void {
    if (!url) return;

    if (url.startsWith("blob:")) {
      this.trackedBlobUrls.add(url);
    }

    // Identify superseded redo items to revoke if they're blobs
    if (this.currentIndex >= 0 && this.currentIndex < this.history.length - 1) {
      const superseded = this.history.slice(this.currentIndex + 1);
      const remaining = this.history.slice(0, this.currentIndex + 1);

      superseded.forEach((item) => {
        if (item.startsWith("blob:") && !remaining.includes(item) && item !== url) {
          try {
            URL.revokeObjectURL(item);
            this.trackedBlobUrls.delete(item);
          } catch {}
        }
      });

      this.history = remaining;
    }

    this.history.push(url);
    this.currentIndex = this.history.length - 1;
  }

  public undo(): string | null {
    if (!this.canUndo) return null;
    this.currentIndex -= 1;
    return this.currentUrl;
  }

  public redo(): string | null {
    if (!this.canRedo) return null;
    this.currentIndex += 1;
    return this.currentUrl;
  }

  /**
   * Cleanly revokes all blob URLs created during this session.
   * Must be called when closing or unmounting the photo editor screen.
   */
  public destroy(): void {
    this.trackedBlobUrls.forEach((url) => {
      try {
        if (url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      } catch {}
    });
    this.trackedBlobUrls.clear();
    this.history = [];
    this.currentIndex = -1;
  }
}
