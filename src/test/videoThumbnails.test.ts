import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRobustSeekVideo, mockGetThumbnail, mockIsNativePlatform, mockGetPlatform } = vi.hoisted(() => ({
  mockRobustSeekVideo: vi.fn(),
  mockGetThumbnail: vi.fn(),
  mockIsNativePlatform: vi.fn(() => false),
  mockGetPlatform: vi.fn(() => "web"),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: mockIsNativePlatform,
    getPlatform: mockGetPlatform,
  },
}));

vi.mock("@/lib/videoSeeking", () => ({
  robustSeekVideo: mockRobustSeekVideo,
}));

vi.mock("@/services/media/ThumbnailService", () => ({
  thumbnailService: {
    getThumbnail: mockGetThumbnail,
  },
}));

import {
  generateThumbnails,
  remapThumbnailsToCount,
  clearThumbnailCache,
  getCachedThumbnails,
  setCachedThumbnails,
  getThumbnailCacheKeys,
  clearVideoElementPool,
  getVideoPoolKeys,
  getActiveThumbnailTasksCount,
} from "@/lib/videoUtils";

describe("Timeline Thumbnails Performance & Stability (videoUtils & ClipThumbnails)", () => {
  const origCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    clearThumbnailCache();
    clearVideoElementPool();
    mockRobustSeekVideo.mockReset();
    mockGetThumbnail.mockReset();
    mockIsNativePlatform.mockReturnValue(false);
    mockGetPlatform.mockReturnValue("web");

    vi.spyOn(document, "createElement").mockImplementation((tagName: string, options?: any) => {
      if (tagName.toLowerCase() === "canvas") {
        const canvas = origCreateElement("canvas");
        (canvas as any).getContext = () => ({
          drawImage: vi.fn(),
        });
        (canvas as any).toDataURL = () => "data:image/jpeg;base64,fakeframe";
        return canvas;
      }
      if (tagName.toLowerCase() === "video") {
        const video = origCreateElement("video");
        let currentReadyState = 0;
        Object.defineProperty(video, "readyState", {
          get: () => currentReadyState,
          set: (v) => {
            currentReadyState = v;
          },
          configurable: true,
        });
        Object.defineProperty(video, "videoWidth", { value: 1280, configurable: true });
        Object.defineProperty(video, "videoHeight", { value: 720, configurable: true });
        const origAddEvent = video.addEventListener.bind(video);
        video.addEventListener = ((type: string, listener: any, opts?: any) => {
          origAddEvent(type, listener, opts);
          if (type === "loadeddata") {
            setTimeout(() => {
              if ((video as any).__failLoad) {
                video.dispatchEvent(new Event("error"));
              } else {
                currentReadyState = 2;
                video.dispatchEvent(new Event("loadeddata"));
              }
            }, 2);
          }
        }) as any;
        return video;
      }
      return origCreateElement(tagName, options);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearThumbnailCache();
    clearVideoElementPool();
  });

  it("(1) Partial result (failed seek) is NOT cached and preserves fixed slot positions, while complete result IS cached", async () => {
    // Frame 0 succeeds, Frame 1 fails seek, Frame 2 succeeds
    mockRobustSeekVideo
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const partial = await generateThumbnails("blob:video-partial", 3, 0, 6, 96, undefined, {
      mediaKey: "clip_partial",
    });

    // Must keep length 3 with "" at index 1 instead of shifting index 2 into index 1
    expect(partial).toHaveLength(3);
    expect(partial[0]).toBe("data:image/jpeg;base64,fakeframe");
    expect(partial[1]).toBe("");
    expect(partial[2]).toBe("data:image/jpeg;base64,fakeframe");

    // Partial result must NOT be stored in cache
    const cacheKey = "clip_partial|0.00|6.00|3";
    expect(getCachedThumbnails(cacheKey, 3)).toBeUndefined();

    // Now all 3 seeks succeed -> must be cached
    mockRobustSeekVideo.mockResolvedValue(true);
    const complete = await generateThumbnails("blob:video-partial", 3, 0, 6, 96, undefined, {
      mediaKey: "clip_partial",
    });
    expect(complete).toEqual([
      "data:image/jpeg;base64,fakeframe",
      "data:image/jpeg;base64,fakeframe",
      "data:image/jpeg;base64,fakeframe",
    ]);
    expect(getCachedThumbnails(cacheKey, 3)).toEqual(complete);
  });

  it("(1b) Android native path also preserves fixed positions and only caches complete arrays", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockGetPlatform.mockReturnValue("android");

    mockGetThumbnail
      .mockResolvedValueOnce({ success: true, webPath: "native://frame0" })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true, webPath: "native://frame2" });

    const partialNative = await generateThumbnails("file:///video.mp4", 3, 0, 3, 96, undefined, {
      mediaKey: "android_clip",
    });
    expect(partialNative).toEqual(["native://frame0", "", "native://frame2"]);
    expect(getCachedThumbnails("android_clip|0.00|3.00|3", 3)).toBeUndefined();

    mockGetThumbnail.mockResolvedValue({ success: true, webPath: "native://ok" });
    const fullNative = await generateThumbnails("file:///video.mp4", 3, 0, 3, 96, undefined, {
      mediaKey: "android_clip",
    });
    expect(fullNative).toEqual(["native://ok", "native://ok", "native://ok"]);
    expect(getCachedThumbnails("android_clip|0.00|3.00|3", 3)).toEqual([
      "native://ok",
      "native://ok",
      "native://ok",
    ]);
  });

  it("(2) remapThumbnailsToCount maps each slot i to floor(i * prev.length / count)", () => {
    const prev3 = ["img0", "img1", "img2"];
    // 3 -> 6: indices floor(i * 3 / 6) => [0, 0, 1, 1, 2, 2]
    expect(remapThumbnailsToCount(prev3, 6)).toEqual([
      "img0",
      "img0",
      "img1",
      "img1",
      "img2",
      "img2",
    ]);

    // 3 -> 12: each of the 3 images repeats 4 times
    expect(remapThumbnailsToCount(prev3, 12)).toEqual([
      "img0", "img0", "img0", "img0",
      "img1", "img1", "img1", "img1",
      "img2", "img2", "img2", "img2",
    ]);

    // 6 -> 3: indices floor(i * 6 / 3) => [0, 2, 4]
    const prev6 = ["a0", "a1", "a2", "a3", "a4", "a5"];
    expect(remapThumbnailsToCount(prev6, 3)).toEqual(["a0", "a2", "a4"]);

    // Empty previous array -> returns skeleton slots ("")
    expect(remapThumbnailsToCount([], 4)).toEqual(["", "", "", ""]);
  });

  it("(3) LRU cache evicts the oldest entry when exceeding the limit, and video pool evicts oldest & closes src", async () => {
    // Test thumbCache LRU with maxEntries = 3
    setCachedThumbnails("k1", ["a", "b"], 2, 3);
    setCachedThumbnails("k2", ["c", "d"], 2, 3);
    setCachedThumbnails("k3", ["e", "f"], 2, 3);
    expect(getThumbnailCacheKeys()).toEqual(["k1", "k2", "k3"]);

    // Access k1 so k2 becomes the oldest
    expect(getCachedThumbnails("k1", 2)).toEqual(["a", "b"]);
    expect(getThumbnailCacheKeys()).toEqual(["k2", "k3", "k1"]);

    // Insert k4 with maxEntries = 3 -> k2 must be evicted
    setCachedThumbnails("k4", ["g", "h"], 2, 3);
    expect(getThumbnailCacheKeys()).toEqual(["k3", "k1", "k4"]);
    expect(getCachedThumbnails("k2", 2)).toBeUndefined();

    // Test <video> pool LRU (max 2 elements)
    mockRobustSeekVideo.mockResolvedValue(true);
    await generateThumbnails("blob:url-1", 1, 0, 1);
    await generateThumbnails("blob:url-2", 1, 0, 1);
    expect(getVideoPoolKeys()).toEqual(["blob:url-1", "blob:url-2"]);

    // Re-use url-1 (now readyState >= 2) so url-2 becomes oldest
    await generateThumbnails("blob:url-1", 1, 1, 2);
    expect(getVideoPoolKeys()).toEqual(["blob:url-2", "blob:url-1"]);

    // Load url-3 -> url-2 must be evicted from the 2-element pool
    await generateThumbnails("blob:url-3", 1, 0, 1);
    expect(getVideoPoolKeys()).toEqual(["blob:url-1", "blob:url-3"]);
  });

  it("(4) Concurrency lock is always released on normal completion, error, and abort (Web & Android)", async () => {
    expect(getActiveThumbnailTasksCount()).toBe(0);

    // Case A: Abort during seek on Web
    const abortCtrl1 = new AbortController();
    mockRobustSeekVideo.mockImplementationOnce(async () => {
      abortCtrl1.abort();
      return false;
    });
    await generateThumbnails("blob:abort-web", 2, 0, 2, 96, undefined, {
      signal: abortCtrl1.signal,
    });
    expect(getActiveThumbnailTasksCount()).toBe(0);

    // Case B: Seek throws unexpected error on Web
    mockRobustSeekVideo.mockRejectedValueOnce(new Error("Seek exploded"));
    await generateThumbnails("blob:error-web", 2, 0, 2);
    expect(getActiveThumbnailTasksCount()).toBe(0);

    // Case C: Android native path throws error and falls back or aborts
    mockIsNativePlatform.mockReturnValue(true);
    mockGetPlatform.mockReturnValue("android");
    const abortCtrl2 = new AbortController();
    mockGetThumbnail.mockImplementationOnce(async () => {
      abortCtrl2.abort();
      throw new Error("Native retriever error");
    });
    await generateThumbnails("file:///err.mp4", 2, 0, 2, 96, undefined, {
      signal: abortCtrl2.signal,
    });
    expect(getActiveThumbnailTasksCount()).toBe(0);
  });
});
