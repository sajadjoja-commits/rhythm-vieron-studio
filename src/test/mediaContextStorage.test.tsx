import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  openDB,
  idbPut,
  idbGet,
  idbAll,
  idbDel,
  resetIdbConnection,
  STORE_PROJECTS,
  STORE_FILES,
} from "@/lib/idbStore";
import { MediaProvider, useMedia } from "@/context/MediaContext";
import { projectRecoveryService } from "@/services/recovery/ProjectRecoveryService";
import { supabase } from "@/integrations/supabase/client";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/videoSeeking", () => ({
  robustSeekVideo: vi.fn(async () => true),
}));

// Helper to create an in-memory fake IndexedDB
function createFakeIndexedDB() {
  const stores = new Map<string, Map<any, any>>();
  stores.set(STORE_PROJECTS, new Map());
  stores.set(STORE_FILES, new Map());

  const callOrder: string[] = [];
  let openCount = 0;
  let lastDbInstance: any = null;

  const fakeIndexedDB = {
    open: vi.fn((_name: string, _version?: number) => {
      openCount++;
      const req: any = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };

      queueMicrotask(() => {
        const db: any = {
          onclose: null,
          onversionchange: null,
          objectStoreNames: {
            contains: (n: string) => stores.has(n),
          },
          createObjectStore: (n: string) => {
            if (!stores.has(n)) stores.set(n, new Map());
            return {};
          },
          close: vi.fn(),
          transaction: (storeName: string, _mode: string) => ({
            objectStore: (sName: string) => {
              const map = stores.get(sName) ?? new Map();
              stores.set(sName, map);
              return {
                put: (val: any, key?: any) => {
                  const effectiveKey = key !== undefined ? key : val?.id;
                  callOrder.push(`put:${sName}:${String(effectiveKey)}`);
                  map.set(effectiveKey, val);
                  const r: any = { onsuccess: null, onerror: null };
                  queueMicrotask(() => r.onsuccess?.());
                  return r;
                },
                get: (key: any) => {
                  callOrder.push(`get:${sName}:${String(key)}`);
                  const r: any = { result: map.get(key), onsuccess: null, onerror: null };
                  queueMicrotask(() => r.onsuccess?.());
                  return r;
                },
                getAll: () => {
                  callOrder.push(`getAll:${sName}`);
                  const r: any = { result: Array.from(map.values()), onsuccess: null, onerror: null };
                  queueMicrotask(() => r.onsuccess?.());
                  return r;
                },
                delete: (key: any) => {
                  callOrder.push(`del:${sName}:${String(key)}`);
                  map.delete(key);
                  const r: any = { onsuccess: null, onerror: null };
                  queueMicrotask(() => r.onsuccess?.());
                  return r;
                },
              };
            },
          }),
        };
        lastDbInstance = db;
        req.result = db;
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });

      return req;
    }),
  };

  return {
    fakeIndexedDB,
    stores,
    callOrder,
    getOpenCount: () => openCount,
    getLastDb: () => lastDbInstance,
  };
}

describe("Project State Performance & Storage Integrity Suite", () => {
  let idbEnv: ReturnType<typeof createFakeIndexedDB>;
  const origIndexedDB = globalThis.indexedDB;

  beforeEach(() => {
    resetIdbConnection();
    idbEnv = createFakeIndexedDB();
    (globalThis as any).indexedDB = idbEnv.fakeIndexedDB;
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => "blob:https://example.com/mock-blob");
    } else {
      vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:https://example.com/mock-blob");
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    }
    localStorage.clear();
  });

  afterEach(() => {
    resetIdbConnection();
    (globalThis as any).indexedDB = origIndexedDB;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // (أ) Consumer render count on histVersion change & stable function identities
  // --------------------------------------------------------------------------
  it("(أ) should not re-render consumers more than once on histVersion commit and keep getMediaById & sibling callbacks stable when clips change", async () => {
    vi.useFakeTimers();

    let consumerARenders = 0;
    let consumerBRenders = 0;
    let latestCtx: ReturnType<typeof useMedia> | null = null;
    const seenGetMediaById = new Set<any>();
    const seenResolveTimelineTime = new Set<any>();
    const seenTrimClip = new Set<any>();
    const seenApplySmartTemplate = new Set<any>();
    const seenNewProject = new Set<any>();
    const seenLoadProject = new Set<any>();
    const seenSplitTrackAt = new Set<any>();

    function ConsumerA() {
      const ctx = useMedia();
      consumerARenders++;
      latestCtx = ctx;
      seenGetMediaById.add(ctx.getMediaById);
      seenResolveTimelineTime.add(ctx.resolveTimelineTime);
      seenTrimClip.add(ctx.trimClip);
      seenApplySmartTemplate.add(ctx.applySmartTemplate);
      seenNewProject.add(ctx.newProject);
      seenLoadProject.add(ctx.loadProject);
      seenSplitTrackAt.add(ctx.splitTrackAt);
      return null;
    }

    function ConsumerB() {
      useMedia();
      consumerBRenders++;
      return null;
    }

    render(
      <MediaProvider>
        <ConsumerA />
        <ConsumerB />
      </MediaProvider>
    );

    // Wait for initial hydration microtasks
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latestCtx).not.toBeNull();

    // Trigger a clips update
    act(() => {
      latestCtx!.setClips([
        { id: "clip-1", mediaId: "m-1", in: 0, out: 6 },
        { id: "clip-2", mediaId: "m-1", in: 6, out: 12 },
      ]);
    });

    const rendersBeforeHistCommitA = consumerARenders;
    const rendersBeforeHistCommitB = consumerBRenders;

    // Advance 450ms so histVersion increments when history snapshot commits
    act(() => {
      vi.advanceTimersByTime(460);
    });

    // Changing histVersion only re-renders each consumer at most once
    expect(consumerARenders - rendersBeforeHistCommitA).toBeLessThanOrEqual(1);
    expect(consumerBRenders - rendersBeforeHistCommitB).toBeLessThanOrEqual(1);
    expect(latestCtx!.canUndo).toBe(true);

    // Change clips again and verify getMediaById and all ref-backed functions never changed identity
    act(() => {
      latestCtx!.setClips([{ id: "clip-1", mediaId: "m-1", in: 0, out: 4 }]);
    });

    expect(seenGetMediaById.size).toBe(1);
    expect(seenResolveTimelineTime.size).toBe(1);
    expect(seenTrimClip.size).toBe(1);
    expect(seenApplySmartTemplate.size).toBe(1);
    expect(seenNewProject.size).toBe(1);
    expect(seenLoadProject.size).toBe(1);
    expect(seenSplitTrackAt.size).toBe(1);

    // Verify requirement 6: applySmartTemplate uses tpl.transitionDuration (and defaults to 0.5)
    act(() => {
      latestCtx!.setClips([
        { id: "c1", mediaId: "m-1", in: 0, out: 5 },
        { id: "c2", mediaId: "m-1", in: 0, out: 5 },
      ]);
    });

    act(() => {
      latestCtx!.applySmartTemplate({
        id: "custom-tpl",
        name: "Custom",
        nameEn: "Custom",
        emoji: "🎬",
        desc: "",
        descEn: "",
        category: "cinematic",
        accent: "#000",
        gradient: "",
        filters: [],
        vfx: [],
        transition: "zoom",
        transitionDuration: 0.85,
        caption: { font: "Cairo", size: 20, color: "#fff", bg: "#000", animation: "fade", position: "bottom" },
        segmentSec: 0,
        ai: {} as any,
        promo: {} as any,
      });
    });

    expect(latestCtx!.clips[1].transitionIn).toEqual({ type: "zoom", duration: 0.85 });
  });

  // --------------------------------------------------------------------------
  // (ب) Single IDB connection across 20 operations & reconnect on close/versionchange
  // --------------------------------------------------------------------------
  it("(ب) should reuse a single IDB connection across 20 operations and reopen on onclose/onversionchange", async () => {
    for (let i = 0; i < 5; i++) {
      await idbPut(STORE_FILES, `file:${i}`, new Blob([`data-${i}`]));
      await idbGet(STORE_FILES, `file:${i}`);
      await idbAll(STORE_FILES);
      await idbDel(STORE_FILES, `file:${i}`);
    }

    // 5 * 4 = 20 operations executed; indexedDB.open must have been called only ONCE
    expect(idbEnv.getOpenCount()).toBe(1);

    // Simulate connection close -> next operation should reopen cleanly
    const db1 = idbEnv.getLastDb();
    expect(db1).not.toBeNull();
    db1.onclose?.();

    await idbPut(STORE_FILES, "file:after-close", new Blob(["x"]));
    expect(idbEnv.getOpenCount()).toBe(2);

    // Simulate versionchange -> closes db and reopens on next operation
    const db2 = idbEnv.getLastDb();
    db2.onversionchange?.();
    expect(db2.close).toHaveBeenCalledTimes(1);

    await openDB();
    expect(idbEnv.getOpenCount()).toBe(3);
  });

  // --------------------------------------------------------------------------
  // (ج) deleteProject deletes all fileKeys (media, audioTracks, overlays) BEFORE project record
  // --------------------------------------------------------------------------
  it("(ج) should read project first, delete all media/audioTracks/overlays fileKeys, then delete project record and cloud row", async () => {
    const projId = "proj-to-delete";
    await idbPut(STORE_PROJECTS, undefined, {
      id: projId,
      name: "Test Project",
      media: [{ id: "m1", fileKey: "media:m1" }, { id: "m2", fileKey: "media:m2" }],
      audioTracks: [{ id: "a1", fileKey: "audio:a1" }],
      overlays: [{ id: "o1", fileKey: "overlay:o1" }],
    });
    await idbPut(STORE_FILES, "media:m1", new Blob(["m1"]));
    await idbPut(STORE_FILES, "media:m2", new Blob(["m2"]));
    await idbPut(STORE_FILES, "audio:a1", new Blob(["a1"]));
    await idbPut(STORE_FILES, "overlay:o1", new Blob(["o1"]));

    let ctxRef: ReturnType<typeof useMedia> | null = null;
    function Reader() {
      ctxRef = useMedia();
      return null;
    }

    render(
      <MediaProvider>
        <Reader />
      </MediaProvider>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    idbEnv.callOrder.length = 0;

    await act(async () => {
      await ctxRef!.deleteProject(projId);
    });

    // Verify order: get project -> delete all 4 fileKeys -> delete project record
    expect(idbEnv.callOrder[0]).toBe(`get:${STORE_PROJECTS}:${projId}`);
    const fileDelCalls = idbEnv.callOrder.slice(1, 5);
    expect(new Set(fileDelCalls)).toEqual(
      new Set([
        `del:${STORE_FILES}:media:m1`,
        `del:${STORE_FILES}:media:m2`,
        `del:${STORE_FILES}:audio:a1`,
        `del:${STORE_FILES}:overlay:o1`,
      ])
    );
    expect(idbEnv.callOrder[5]).toBe(`del:${STORE_PROJECTS}:${projId}`);

    // Verify all files and the project record are actually removed from the stores
    expect(idbEnv.stores.get(STORE_FILES)!.size).toBe(0);
    expect(idbEnv.stores.get(STORE_PROJECTS)!.has(projId)).toBe(false);
  });

  // --------------------------------------------------------------------------
  // (د) Cover image is never saved or read as blob: and listProjects never loads video blobs
  // --------------------------------------------------------------------------
  it("(د) should never save or read coverImage starting with blob: and should use thumbnail or null", async () => {
    vi.useFakeTimers();

    // Seed an old project in IDB that had a stale blob: coverImage and a media fileKey
    const oldProjId = "legacy-blob-proj";
    idbEnv.stores.get(STORE_PROJECTS)!.set(oldProjId, {
      id: oldProjId,
      name: "Legacy",
      updatedAt: 1000,
      coverImage: "blob:https://example.com/dead-uuid",
      media: [{ id: "m-legacy", fileKey: "media:m-legacy" }],
      clips: [{ id: "c1", mediaId: "m-legacy", in: 0, out: 4 }],
    });
    idbEnv.stores.get(STORE_FILES)!.set("media:m-legacy", new Blob(["heavy-video"]));

    let ctxRef: ReturnType<typeof useMedia> | null = null;
    function Harness() {
      ctxRef = useMedia();
      return null;
    }

    render(
      <MediaProvider>
        <Harness />
      </MediaProvider>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // 1. listProjects ignores blob: coverImage and does NOT read STORE_FILES
    idbEnv.callOrder.length = 0;
    let listed: any[] = [];
    await act(async () => {
      listed = await ctxRef!.listProjects();
    });
    const foundLegacy = listed.find((p) => p.id === oldProjId);
    expect(foundLegacy).toBeDefined();
    expect(foundLegacy.coverImage).toBeNull();
    expect(idbEnv.callOrder.some((c) => c.includes(STORE_FILES))).toBe(false);

    // 2. Setting a blob: coverImage or having media[0].url = blob:... must never save blob: on autosave
    act(() => {
      ctxRef!.setCoverImage("blob:https://example.com/should-be-ignored");
      ctxRef!. setProjectName("Cover Check Project");
    });

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
      await Promise.resolve();
    });

    const savedProj = idbEnv.stores.get(STORE_PROJECTS)!.get(ctxRef!.projectId);
    expect(savedProj).toBeDefined();
    expect(savedProj.coverImage).toBeNull();
  });

  // --------------------------------------------------------------------------
  // (هـ) Cloud sync rate-limited to max once per 20s across 10 consecutive edits
  // --------------------------------------------------------------------------
  it("(هـ) should upload to Supabase at most once per 20 seconds across 10 consecutive edits and skip unchanged content", async () => {
    vi.useFakeTimers();

    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { user: { id: "user-1" } } as any },
      error: null,
    });
    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "projects") {
        return { upsert: upsertMock } as any;
      }
      return {} as any;
    });

    let ctxRef: ReturnType<typeof useMedia> | null = null;
    function Harness() {
      ctxRef = useMedia();
      return null;
    }

    render(
      <MediaProvider>
        <Harness />
      </MediaProvider>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Perform 10 consecutive edits spaced by 1s each (10s total, each triggering the 600ms local autosave)
    for (let i = 1; i <= 10; i++) {
      act(() => {
        ctxRef!.setProjectName(`Edit #${i}`);
      });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    // Within the first 10 seconds, trailing 20s cloud sync has not fired yet (0 uploads so far)
    expect(upsertMock).toHaveBeenCalledTimes(0);

    // Advance remaining time to reach the 20s window
    await act(async () => {
      vi.advanceTimersByTime(11_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Exactly 1 cloud upload occurred across all 10 edits, carrying the latest state ("Edit #10")
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0].name).toBe("Edit #10");

    // Re-triggering local save with identical content should NOT trigger another cloud upload
    act(() => {
      ctxRef!.setProjectName("Edit #10");
    });
    await act(async () => {
      vi.advanceTimersByTime(21_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(upsertMock).toHaveBeenCalledTimes(1);

    // Changing content and firing pagehide flushes immediately without waiting 20s
    act(() => {
      ctxRef!.setProjectName("Before Exit");
    });
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock.mock.calls[1][0].name).toBe("Before Exit");
  });

  // --------------------------------------------------------------------------
  // (و) 12 video files: max 3 active metadata <video> and max 2 active thumbnail <video>
  // --------------------------------------------------------------------------
  it("(و) should limit concurrent video elements to at most 3 for metadata and 2 for thumbnails when importing 12 videos", async () => {
    const origCreateElement = document.createElement.bind(document);

    let activeMetadataVideos = 0;
    let maxActiveMetadataVideos = 0;
    let activeThumbnailVideos = 0;
    let maxActiveThumbnailVideos = 0;
    let totalMetadataProcessed = 0;
    let totalThumbnailsProcessed = 0;

    const pendingMetadataResolvers: Array<() => void> = [];
    const pendingThumbnailResolvers: Array<() => void> = [];

    vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: any) => {
      if (tagName.toLowerCase() === "video") {
        const fakeVideo: any = {
          preload: "auto",
          muted: false,
          playsInline: false,
          duration: 12,
          videoWidth: 1280,
          videoHeight: 720,
          currentTime: 0,
          onloadedmetadata: null,
          onloadeddata: null,
          onerror: null,
          _activeType: null as "meta" | "thumb" | null,
          _src: "",
          load: vi.fn(),
          removeAttribute: vi.fn(),
        };

        Object.defineProperty(fakeVideo, "src", {
          get() {
            return this._src;
          },
          set(val: string) {
            this._src = val;
            if (val && !this._activeType) {
              if (this.preload === "metadata") {
                this._activeType = "meta";
                activeMetadataVideos++;
                if (activeMetadataVideos > maxActiveMetadataVideos) {
                  maxActiveMetadataVideos = activeMetadataVideos;
                }
                pendingMetadataResolvers.push(() => {
                  totalMetadataProcessed++;
                  fakeVideo.onloadedmetadata?.();
                });
              } else {
                this._activeType = "thumb";
                activeThumbnailVideos++;
                if (activeThumbnailVideos > maxActiveThumbnailVideos) {
                  maxActiveThumbnailVideos = activeThumbnailVideos;
                }
                pendingThumbnailResolvers.push(() => {
                  totalThumbnailsProcessed++;
                  fakeVideo.onloadeddata?.();
                });
              }
            } else if (!val && this._activeType) {
              if (this._activeType === "meta") {
                activeMetadataVideos--;
              } else if (this._activeType === "thumb") {
                activeThumbnailVideos--;
              }
              this._activeType = null;
            }
          },
        });

        return fakeVideo;
      }
      if (tagName.toLowerCase() === "canvas") {
        return {
          width: 320,
          height: 180,
          getContext: () => ({ drawImage: vi.fn() }),
          toDataURL: () => "data:image/jpeg;base64,thumbdata",
        } as any;
      }
      return origCreateElement(tagName, options);
    }) as any);

    let ctxRef: ReturnType<typeof useMedia> | null = null;
    function Harness() {
      ctxRef = useMedia();
      return null;
    }

    render(
      <MediaProvider>
        <Harness />
      </MediaProvider>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const files = Array.from({ length: 12 }, (_, i) =>
      new File([new Uint8Array([i])], `clip_${i + 1}.mp4`, { type: "video/mp4" })
    );

    let addedItems: any[] = [];
    await act(async () => {
      addedItems = await ctxRef!.addFiles(files);
    });

    // Media items appear immediately upon addFiles
    expect(addedItems.length).toBe(12);
    expect(ctxRef!.media.length).toBe(12);
    expect(ctxRef!.clips.length).toBe(12);

    // Drain queued metadata and thumbnail tasks step by step
    for (let step = 0; step < 20; step++) {
      await act(async () => {
        const metaBatch = pendingMetadataResolvers.splice(0, pendingMetadataResolvers.length);
        metaBatch.forEach((fn) => fn());
        const thumbBatch = pendingThumbnailResolvers.splice(0, pendingThumbnailResolvers.length);
        thumbBatch.forEach((fn) => fn());
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      if (totalMetadataProcessed === 12 && totalThumbnailsProcessed === 12) break;
    }

    expect(totalMetadataProcessed).toBe(12);
    expect(totalThumbnailsProcessed).toBe(12);
    expect(maxActiveMetadataVideos).toBeLessThanOrEqual(3);
    expect(maxActiveMetadataVideos).toBe(3);
    expect(maxActiveThumbnailVideos).toBeLessThanOrEqual(2);
    expect(maxActiveThumbnailVideos).toBe(2);
    expect(activeMetadataVideos).toBe(0);
    expect(activeThumbnailVideos).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Additional check: ProjectRecoveryService.saveSnapshot min 5s interval
  // --------------------------------------------------------------------------
  it("should rate-limit ProjectRecoveryService.saveSnapshot storage writes to at least 5 seconds apart", () => {
    vi.useFakeTimers();
    projectRecoveryService.dismissRecovery();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    projectRecoveryService.saveSnapshot("p-1", "Project 1", { clips: [{ id: "1" }] });
    const countAfterFirst = setItemSpy.mock.calls.filter(([k]) => k.startsWith("vieron_recovery_snapshot_")).length;
    expect(countAfterFirst).toBe(1);

    // 5 rapid calls within 2 seconds -> should not write to localStorage yet
    for (let i = 2; i <= 6; i++) {
      vi.advanceTimersByTime(300);
      projectRecoveryService.saveSnapshot("p-1", `Project ${i}`, { clips: [{ id: String(i) }] });
    }
    const countBefore5s = setItemSpy.mock.calls.filter(([k]) => k.startsWith("vieron_recovery_snapshot_")).length;
    expect(countBefore5s).toBe(1);

    // Advance past 5 seconds -> trailing snapshot write executes once with latest state
    vi.advanceTimersByTime(4000);
    const countAfter5s = setItemSpy.mock.calls.filter(([k]) => k.startsWith("vieron_recovery_snapshot_")).length;
    expect(countAfter5s).toBe(2);
    expect(projectRecoveryService.getRecoveryData("p-1")?.projectName).toBe("Project 6");
  });
});
