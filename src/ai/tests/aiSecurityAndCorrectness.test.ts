import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { KeyManager } from "../keyManager/KeyManager";
import { AICache } from "../cache/AICache";
import { GroqProvider } from "../providers/remote/GroqProvider";
import { FluxProvider } from "../providers/remote/FluxProvider";
import { GeminiProvider } from "../providers/remote/GeminiProvider";
import { ReplicateProvider } from "../providers/remote/ReplicateProvider";
import { SupabaseEdgeProvider } from "../providers/remote/SupabaseEdgeProvider";
import { SpeechToTextTask } from "../tasks/SpeechToTextTask";
import { TranslationTask } from "../tasks/TranslationTask";
import { AIHistoryManager } from "../runtime/AIHistoryManager";
import { AIResourceManager } from "../runtime/AIResourceManager";
import { AICapabilityRegistry } from "../runtime/AICapabilityRegistry";
import { AIRuntime } from "../runtime/AIRuntime";
import { AIJobQueue } from "../runtime/AIJobQueue";
import { AIProgressManager } from "../runtime/AIProgressManager";
import {
  activeJobs as audioWorkerActiveJobs,
  processDenoise,
  selectNoiseProfileHops,
} from "../audio/audioProcessing.worker";
import { AudioWorkerManager } from "../audio/AudioWorkerManager";
import { VideoWorkerManager } from "../video/VideoWorkerManager";
import { AIOutputVerifier } from "../utils/AIOutputVerifier";

describe("AI Library Security & Correctness Verification Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    const envKeysToClear = [
      "VITE_GROQ_API_KEY",
      "GROQ_API_KEY",
      "VITE_FLUX_API_KEY",
      "FLUX_API_KEY",
      "VITE_BFL_API_KEY",
      "BFL_API_KEY",
      "VITE_BLACKFORESTLABS_API_KEY",
      "BLACKFORESTLABS_API_KEY",
      "VITE_GEMINI_API_KEY",
      "GEMINI_API_KEY",
      "VITE_GOOGLE_API_KEY",
      "GOOGLE_API_KEY",
      "VITE_REPLICATE_API_KEY",
      "REPLICATE_API_KEY",
      "REPLICATE_API_TOKEN",
      "VITE_SUPABASE_EDGE_API_KEY",
      "SUPABASE_EDGE_API_KEY",
      "VITE_SUPABASE_API_KEY",
      "SUPABASE_API_KEY",
    ];
    for (const k of envKeysToClear) {
      vi.stubEnv(k, "");
    }
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  // --------------------------------------------------------------------------
  // 1. Project-Wide Hardcoded Secret Scanner
  // --------------------------------------------------------------------------
  it("should contain zero hardcoded secrets across src, public, android, scripts, and .env* files", () => {
    const rootDir = process.cwd();
    const secretPatterns: Array<{ label: string; regex: RegExp }> = [
      { label: "Groq key", regex: new RegExp("gsk" + "_[A-Za-z0-9]{10,}|['\"]gsk" + "_['\"]\\s*\\+") },
      { label: "BFL/Flux key", regex: new RegExp("bfl" + "_[A-Za-z0-9]{10,}|['\"]bfl" + "_['\"]\\s*\\+") },
      { label: "OpenAI/Secret key", regex: new RegExp("\\bsk" + "-[A-Za-z0-9_-]{12,}") },
      { label: "Google AIza key", regex: new RegExp("AIza" + "[A-Za-z0-9_-]{15,}") },
      { label: "Replicate r8 key", regex: new RegExp("\\br8" + "_[A-Za-z0-9]{10,}") },
      { label: "ElevenLabs xi key", regex: new RegExp("\\bxi" + "-[A-Za-z0-9]{10,}") },
      { label: "Supabase service_role", regex: new RegExp("['\"]service" + "_role['\"]") },
      { label: "Hardcoded Bearer token", regex: new RegExp("Bearer\\s+[A-Za-z0-9._-]{16,}") },
    ];

    const findings: string[] = [];
    const binaryExtRegex = /\.(png|jpg|jpeg|webp|gif|mp4|webm|mp3|wav|ogg|m4a|onnx|tflite|wasm|ico|woff2?|ttf|eot|jar|apk|aab|keystore|jks|so)$/i;

    const scanFile = (filePath: string, relPath: string) => {
      let content = "";
      try {
        content = fs.readFileSync(filePath, "utf8");
      } catch {
        return;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const p of secretPatterns) {
          if (p.regex.test(line)) {
            // Never log or include secret values—only file path, line number, and pattern label
            findings.push(`${relPath}:${i + 1} (${p.label})`);
          }
        }
      }
    };

    const scanDir = (dirRel: string) => {
      const fullDir = path.join(rootDir, dirRel);
      if (!fs.existsSync(fullDir)) return;
      for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
        if (["node_modules", "dist", ".git", "build", "coverage"].includes(entry.name)) continue;
        const relChild = path.join(dirRel, entry.name);
        const fullChild = path.join(rootDir, relChild);
        if (entry.isDirectory()) {
          scanDir(relChild);
        } else if (entry.isFile() && !binaryExtRegex.test(entry.name)) {
          scanFile(fullChild, relChild);
        }
      }
    };

    for (const targetDir of ["src", "public", "android", "scripts"]) {
      scanDir(targetDir);
    }

    for (const rootEntry of fs.readdirSync(rootDir, { withFileTypes: true })) {
      if (rootEntry.isFile() && rootEntry.name.startsWith(".env")) {
        scanFile(path.join(rootDir, rootEntry.name), rootEntry.name);
      }
    }

    expect(findings).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // 2. KeyManager Security & Lifecycle
  // --------------------------------------------------------------------------
  it("should initialize KeyManager with no default or fallback keys", () => {
    const km = new KeyManager();
    expect(Boolean(km.getKey("groq"))).toBe(false);
    expect(Boolean(km.getKey("flux"))).toBe(false);
    expect(Boolean(km.getKey("bfl"))).toBe(false);
    expect(Boolean(km.getKey("gemini"))).toBe(false);
    expect(Boolean(km.getKey("replicate"))).toBe(false);
    expect(Boolean(km.getKey("supabase-edge"))).toBe(false);

    // Runtime setKey / getKey / removeKey / maskKey
    km.setKey("groq", "test_runtime_key_1234", false);
    expect(km.getKey("groq")).toBe("test_runtime_key_1234");
    expect(km.maskKey("test_runtime_key_1234")).toBe("test...1234");
    km.removeKey("groq");
    expect(Boolean(km.getKey("groq"))).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 3. Remote Providers: Unconfigured Behavior & No Fake Fallbacks
  // --------------------------------------------------------------------------
  it("should mark all remote providers unavailable and return PROVIDER_NOT_CONFIGURED when keys are missing", async () => {
    const km = new KeyManager();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const groq = new GroqProvider(km);
    const flux = new FluxProvider(km);
    const gemini = new GeminiProvider(km);
    const replicate = new ReplicateProvider(km);
    const edge = new SupabaseEdgeProvider(km);

    expect(groq.isAvailable("speech-to-text")).toBe(false);
    expect(flux.isAvailable("image-generation")).toBe(false);
    expect(gemini.isAvailable("translation")).toBe(false);
    expect(replicate.isAvailable("image-generation")).toBe(false);
    expect(edge.isAvailable("speech-to-text")).toBe(false);

    const groqRes = await groq.execute("speech-to-text", { audioBase64: "UklGRg==" });
    expect(groqRes.success).toBe(false);
    expect(groqRes.error?.code).toBe("PROVIDER_NOT_CONFIGURED");

    const fluxRes = await flux.execute("image-generation", { prompt: "a mountain" });
    expect(fluxRes.success).toBe(false);
    expect(fluxRes.error?.code).toBe("PROVIDER_NOT_CONFIGURED");

    const geminiRes = await gemini.execute("translation", { text: "Hello", targetLang: "ar" });
    expect(geminiRes.success).toBe(false);
    expect(geminiRes.error?.code).toBe("PROVIDER_NOT_CONFIGURED");

    const replicateRes = await replicate.execute("image-generation", { prompt: "a mountain" });
    expect(replicateRes.success).toBe(false);
    expect(replicateRes.error?.code).toBe("PROVIDER_NOT_CONFIGURED");

    const edgeRes = await edge.execute("speech-to-text", { audioBase64: "UklGRg==" });
    expect(edgeRes.success).toBe(false);
    expect(edgeRes.error?.code).toBe("PROVIDER_NOT_CONFIGURED");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should fail explicitly in FluxProvider and GeminiProvider on API error without Pollinations or echo fallbacks", async () => {
    const km = new KeyManager();
    km.setKey("flux", "test_flux_token_value", false);
    km.setKey("gemini", "test_gemini_token_value", false);

    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response("Upstream API Error", { status: 500 })
    );

    const flux = new FluxProvider(km);
    const fluxRes = await flux.execute("image-generation", { prompt: "sunset over desert" });
    expect(fluxRes.success).toBe(false);
    expect(fluxRes.data).toBeUndefined();

    const gemini = new GeminiProvider(km);
    const geminiTransRes = await gemini.execute("translation", { text: "Hello world", targetLang: "ar" });
    expect(geminiTransRes.success).toBe(false);
    expect(geminiTransRes.error?.code).toBe("GEMINI_API_ERROR");

    const geminiImgRes = await gemini.execute("image-generation", { prompt: "sunset" });
    expect(geminiImgRes.success).toBe(false);
    expect(geminiImgRes.error?.code).toBe("TASK_NOT_SUPPORTED");
  });

  // --------------------------------------------------------------------------
  // 4. AICache: 64-bit Deterministic Hashing, Binary Types & True LRU Eviction
  // --------------------------------------------------------------------------
  it("should generate distinct 64-bit hashes for long Data URLs differing only in the middle", () => {
    const cache = new AICache({ useLocalStorage: false });
    const header = "data:image/png;base64," + "A".repeat(400);
    const footer = "Z".repeat(400);

    const imgA = header + "M".repeat(500) + "X" + "M".repeat(500) + footer;
    const imgB = header + "M".repeat(500) + "Y" + "M".repeat(500) + footer;

    expect(imgA.length).toBe(imgB.length);
    const hashA = cache.generateHash("background-removal", { imageBase64OrUrl: imgA });
    const hashB = cache.generateHash("background-removal", { imageBase64OrUrl: imgB });

    expect(hashA).toMatch(/^hash_[0-9a-f]{16}$/);
    expect(hashB).toMatch(/^hash_[0-9a-f]{16}$/);
    expect(hashA).not.toBe(hashB);
  });

  it("should distinguish Blob, File, TypedArray, and ArrayBuffer inputs and ignore key order / volatile fields", () => {
    const cache = new AICache({ useLocalStorage: false });

    const blob1 = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
    const blob2 = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "audio/wav" });
    expect(cache.generateHash("noise-reduction", { audioFile: blob1 })).not.toBe(
      cache.generateHash("noise-reduction", { audioFile: blob2 })
    );

    const arr1 = new Float32Array([0.1, 0.2, 0.3]);
    const arr2 = new Float32Array([0.1, 0.9, 0.3]);
    expect(cache.generateHash("custom", { pcm: arr1 })).not.toBe(
      cache.generateHash("custom", { pcm: arr2 })
    );

    const objOrder1 = { prompt: "cat", width: 512, height: 512, historyId: "hist_1" };
    const objOrder2 = { height: 512, prompt: "cat", width: 512, historyId: "hist_2" };
    expect(cache.generateHash("image-generation", objOrder1)).toBe(
      cache.generateHash("image-generation", objOrder2)
    );
  });

  it("should enforce true LRU eviction order on get and set", () => {
    const cache = new AICache({ maxMemoryItems: 3, useLocalStorage: false });

    cache.set("k1", "translation", "val1");
    cache.set("k2", "translation", "val2");
    cache.set("k3", "translation", "val3");

    // Access k1 -> k1 becomes most-recently-used; k2 is now least-recently-used
    expect(cache.get("k1")).toBe("val1");

    // Update k3 in-place at full capacity -> should NOT evict k2 or k1
    cache.set("k3", "translation", "val3_updated");
    expect(cache.get("k2")).toBe("val2");
    // Now order of recency from oldest to newest is: k1 (oldest), k3, k2 (newest)

    // Insert k4 -> should evict k1 (least-recently-used)
    cache.set("k4", "translation", "val4");
    expect(cache.get("k1")).toBeNull();
    expect(cache.get("k3")).toBe("val3_updated");
    expect(cache.get("k2")).toBe("val2");
    expect(cache.get("k4")).toBe("val4");
  });

  // --------------------------------------------------------------------------
  // 5. Task Routing & AIHistoryManager Resilience
  // --------------------------------------------------------------------------
  it("should return PROVIDER_NOT_CONFIGURED from SpeechToTextTask and TranslationTask when providers lack keys", async () => {
    const km = new KeyManager();
    const providers = [
      new GroqProvider(km),
      new SupabaseEdgeProvider(km),
      new GeminiProvider(km),
    ];

    const sttTask = new SpeechToTextTask();
    const sttRes = await sttTask.execute({ audioBase64: "UklGRg==" }, providers);
    expect(sttRes.success).toBe(false);
    expect(sttRes.error?.code).toBe("PROVIDER_NOT_CONFIGURED");

    const transTask = new TranslationTask();
    const transRes = await transTask.execute({ text: "Hello", targetLang: "ar" }, providers);
    expect(transRes.success).toBe(false);
    expect(transRes.error?.code).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("should bound in-memory resultData retention in AIHistoryManager and handle non-array storage", () => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("ai_runtime_history", JSON.stringify({ corrupted: true }));
    }
    const hm = new AIHistoryManager(50);
    expect(hm.getHistory()).toEqual([]);

    for (let i = 0; i < 35; i++) {
      hm.recordJob(
        "enhance-media",
        "local-image-processor",
        100,
        `hash_${i}`,
        true,
        `job_${i}`,
        "ok",
        { outputImageBase64OrUrl: `data:image/png;base64,${i}` }
      );
    }

    const all = hm.getHistory(50);
    expect(all.length).toBe(35);
    // Most recent 25 retain resultData; older ones have resultData pruned in memory
    expect(all[0].resultData).toBeDefined();
    expect(all[24].resultData).toBeDefined();
    expect(all[25].resultData).toBeUndefined();
    expect(all[34].resultData).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // (أ) Resource Check: RESOURCE_LIMIT on 2GB mock device with 1400MB capability,
  //     warning only when memoryKnown = false, and dynamic audio RAM calculation
  // --------------------------------------------------------------------------
  it("(أ) should block with RESOURCE_LIMIT when memoryKnown=true on 2GB device for 1400MB capability and only warn when memoryKnown=false", async () => {
    const registry = AICapabilityRegistry.getInstance();
    const bgRemovalCap = registry.get("ai-bg-removal");
    expect(bgRemovalCap).toBeDefined();
    expect(bgRemovalCap?.estimatedRAMMB).toBe(1400);

    const runtime = AIRuntime.getInstance();
    const rm = runtime.resourceManager;

    // 1. Dynamic audio RAM calculation check: 600s * 48000 * 2 * 4 * 6 = ~1318 MB > 819.2 MB on 2GB
    vi.spyOn(rm, "getProfile").mockReturnValue({
      hasWebGPU: false,
      hasWebGL: true,
      hasWASM: true,
      memoryKnown: true,
      deviceMemoryGB: 2,
      availableRAMMB: 2048,
      hardwareConcurrency: 4,
      isAndroid: true,
      isIOS: false,
      recommendedMode: "remote",
    });

    const audioCap = registry.get("audio-local-dsp")!;
    expect(rm.canRunCapability(audioCap, { durationSec: 5 }).allowed).toBe(true);
    expect(rm.canRunCapability(audioCap, { durationSec: 600 }).allowed).toBe(false);

    // 2. When memoryKnown = true on 2GB device with 1400MB capability -> returns RESOURCE_LIMIT
    const blockedRes = await runtime.runTask(
      "background-removal",
      { imageBase64OrUrl: "data:image/png;base64,iVBORw0KGgo=" },
      { enableCache: false, executionMode: "local" }
    );
    expect(blockedRes.success).toBe(false);
    expect(blockedRes.error?.code).toBe("RESOURCE_LIMIT");
    expect(blockedRes.error?.message).toContain("الذاكرة");

    // 3. When memoryKnown = false on 2GB device -> logs warning only and proceeds to execution
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(rm, "getProfile").mockReturnValue({
      hasWebGPU: false,
      hasWebGL: true,
      hasWASM: true,
      memoryKnown: false,
      deviceMemoryGB: 2,
      availableRAMMB: 2048,
      hardwareConcurrency: 4,
      isAndroid: false,
      isIOS: false,
      recommendedMode: "auto",
    });
    const execSpy = vi.spyOn(runtime.aiManager, "execute").mockResolvedValue({
      success: true,
      data: { outputImageBase64OrUrl: "data:image/png;base64,done" },
      providerUsed: "local-image-processor",
    });

    const warnOnlyRes = await runtime.runTask(
      "background-removal",
      { imageBase64OrUrl: "data:image/png;base64,iVBORw0KGgo=" },
      { enableCache: false, executionMode: "local" }
    );
    expect(warnSpy).toHaveBeenCalled();
    expect(execSpy).toHaveBeenCalled();
    expect(warnOnlyRes.success).toBe(true);
  });

  // --------------------------------------------------------------------------
  // (ب) AIJobQueue.cancelJob: holds active slot until executor finishes,
  //     keeps status as "cancelled", and calls resolveFn exactly once
  // --------------------------------------------------------------------------
  it("(ب) should not free active slot before executor finishes on cancelJob, preserve cancelled status, and resolve once", async () => {
    const pm = AIProgressManager.getInstance();
    const rm = AIResourceManager.getInstance();
    vi.spyOn(rm, "getMaxConcurrentJobs").mockReturnValue(1);

    const queue = new AIJobQueue(pm, rm);

    let finishJob1!: (val: any) => void;
    let job1RecordRef: any = null;
    let job2Started = false;

    const { jobId: job1Id, promise: job1Promise } = queue.enqueue(
      "enhance-media",
      { id: 1 },
      (record) => {
        job1RecordRef = record;
        return new Promise((resolve) => {
          finishJob1 = resolve;
        });
      }
    );

    const { promise: job2Promise } = queue.enqueue(
      "enhance-media",
      { id: 2 },
      async () => {
        job2Started = true;
        return { success: true, data: "job2_ok" };
      }
    );

    // Job 1 is active, Job 2 is queued
    expect(queue.getActiveCount()).toBe(1);
    expect(queue.getQueueLength()).toBe(1);
    expect(job2Started).toBe(false);

    // Cancel active Job 1 while its executor is still running
    const cancelled = queue.cancelJob(job1Id, "User aborted heavy task");
    expect(cancelled).toBe(true);
    expect(job1RecordRef.abortController.signal.aborted).toBe(true);
    expect(job1RecordRef.status).toBe("cancelled");

    // Slot MUST still be occupied by Job 1 until executor finishes
    expect(queue.getActiveCount()).toBe(1);
    expect(queue.getQueueLength()).toBe(1);
    expect(job2Started).toBe(false);

    // Job 1 promise resolves immediately with CANCELLED
    const job1Res = await job1Promise;
    expect(job1Res.success).toBe(false);
    expect(job1Res.error?.code).toBe("CANCELLED");

    // Now finish Job 1's underlying executor with a success payload
    finishJob1({ success: true, data: "late_result" });
    const job2Res = await job2Promise;

    // Job 1 status must stay "cancelled" (never overwritten to "completed")
    expect(job1RecordRef.status).toBe("cancelled");
    // Job 2 ran only after Job 1's executor finished
    expect(job2Started).toBe(true);
    expect(job2Res.success).toBe(true);
    expect(queue.getActiveCount()).toBe(0);
  });

  // --------------------------------------------------------------------------
  // (ج) Audio Noise Profile: builds profile from quiet part after initial speech
  // --------------------------------------------------------------------------
  it("(ج) should build noise profile from quiet region after initial loud speech (beyond first 250 hops) and never force hop 0", () => {
    // Simulate 500 hops: first 320 hops are loud speech (energy = 0.25), remaining 180 hops are quiet noise floor (energy = 0.0004)
    const numHops = 500;
    const frameEnergies = new Float32Array(numHops);
    for (let h = 0; h < 320; h++) {
      frameEnergies[h] = 0.25; // Loud speech at beginning (> 250 hops)
    }
    for (let h = 320; h < numHops; h++) {
      frameEnergies[h] = 0.0004; // Quiet stationary noise after speech
    }

    const sortedEnergies = Float32Array.from(frameEnergies).sort();
    const noiseThresholdIndex = Math.max(0, Math.min(numHops - 1, Math.floor(numHops * 0.20)));
    const noiseThreshold = Math.max(sortedEnergies[noiseThresholdIndex] || 0.00005, 0.00001);

    const selectedHops = selectNoiseProfileHops(frameEnergies, noiseThreshold, 400);
    expect(selectedHops.length).toBe(180);
    // Every selected hop must come from the quiet region (h >= 320), never hop 0 or speech hops
    expect(selectedHops.every((h) => h >= 320)).toBe(true);
    expect(selectedHops.includes(0)).toBe(false);
  });

  // --------------------------------------------------------------------------
  // (د) Audio Worker Cancellation (< 300ms) & Progress Reporting
  // --------------------------------------------------------------------------
  it("(د) should stop audio worker processDenoise in < 300ms upon cancellation and emit progress updates", async () => {
    const sampleRate = 48000;
    // 10 seconds of stereo audio (~3750 hops total) so full run would take much longer if not cancelled
    const length = sampleRate * 10;
    const ch0 = new Float32Array(length);
    const ch1 = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      ch0[i] = Math.sin(i * 0.05) * 0.3 + (i % 7) * 0.002;
      ch1[i] = ch0[i];
    }

    const jobId = "test_cancel_audio_job";
    audioWorkerActiveJobs.add(jobId);

    const progressValues: number[] = [];
    const startMs = performance.now();

    // Schedule cancellation shortly after start (on first progress / 15ms timer)
    setTimeout(() => {
      audioWorkerActiveJobs.delete(jobId);
    }, 10);

    const result = await processDenoise(
      [ch0, ch1],
      sampleRate,
      0.85,
      jobId,
      (pct) => {
        progressValues.push(pct);
        // Also cancel as soon as first batch yields if timer hasn't fired yet
        audioWorkerActiveJobs.delete(jobId);
      }
    );

    const elapsedMs = performance.now() - startMs;
    expect(result).toBeNull();
    expect(elapsedMs).toBeLessThan(300);

    // Verify full run on a short clip emits progress up to 100
    const shortJobId = "test_progress_audio_job";
    audioWorkerActiveJobs.add(shortJobId);
    const shortCh = new Float32Array(256 * 320); // > 300 hops so it yields at hop 150 and 300
    for (let i = 0; i < shortCh.length; i++) {
      shortCh[i] = Math.sin(i * 0.1) * 0.2;
    }
    const shortProgress: number[] = [];
    const shortRes = await processDenoise([shortCh], 16000, 0.8, shortJobId, (p) => shortProgress.push(p));
    expect(shortRes).not.toBeNull();
    expect(shortProgress.length).toBeGreaterThan(0);
    expect(shortProgress[shortProgress.length - 1]).toBe(100);
  });

  // --------------------------------------------------------------------------
  // (هـ) VideoWorkerManager: EMA Adaptive Timeout & Restart up to 3 times in 60s
  // --------------------------------------------------------------------------
  it("(هـ) should clamp timeout to [5000, 20000] from 4x EMA and recreate worker on timeout up to 3 times before local fallback", () => {
    const vwm = new VideoWorkerManager() as any;

    // 1. Verify EMA clamping [5000, 20000]
    expect(vwm.getRequestTimeoutMs()).toBe(5000);
    vwm.recordFrameSuccessDuration(400); // 4 * 400 = 1600 -> clamped to 5000
    expect(vwm.getRequestTimeoutMs()).toBe(5000);

    vwm.frameDurationEmaMs = null;
    vwm.recordFrameSuccessDuration(2500); // 4 * 2500 = 10000
    expect(vwm.getRequestTimeoutMs()).toBe(10000);

    vwm.frameDurationEmaMs = null;
    vwm.recordFrameSuccessDuration(7000); // 4 * 7000 = 28000 -> clamped to 20000
    expect(vwm.getRequestTimeoutMs()).toBe(20000);

    // 2. Verify worker termination and re-creation on timeout (max 3 times in 60s)
    let createdWorkers = 0;
    let terminatedWorkers = 0;
    const OrigWorker = globalThis.Worker;

    class MockVideoWorker {
      public onmessage: any = null;
      public onerror: any = null;
      constructor() {
        createdWorkers++;
      }
      postMessage() {}
      terminate() {
        terminatedWorkers++;
      }
    }

    (globalThis as any).Worker = MockVideoWorker;
    try {
      const manager = new VideoWorkerManager() as any;
      expect(createdWorkers).toBe(1);
      expect(manager.workerAvailable).toBe(true);

      // Timeout 1 -> terminates and recreates (restart #1)
      manager.handleWorkerTimeout("req_1");
      expect(terminatedWorkers).toBe(1);
      expect(createdWorkers).toBe(2);
      expect(manager.workerAvailable).toBe(true);

      // Timeout 2 -> terminates and recreates (restart #2)
      manager.handleWorkerTimeout("req_2");
      expect(terminatedWorkers).toBe(2);
      expect(createdWorkers).toBe(3);
      expect(manager.workerAvailable).toBe(true);

      // Timeout 3 -> terminates and recreates (restart #3)
      manager.handleWorkerTimeout("req_3");
      expect(terminatedWorkers).toBe(3);
      expect(createdWorkers).toBe(4);
      expect(manager.workerAvailable).toBe(true);

      // Timeout 4 within 60s -> exceeds 3 restarts, switches to local fallback without creating another worker
      manager.handleWorkerTimeout("req_4");
      expect(terminatedWorkers).toBe(4);
      expect(createdWorkers).toBe(4);
      expect(manager.workerAvailable).toBe(false);
      expect(manager.permanentlyLocalFallback).toBe(true);
    } finally {
      (globalThis as any).Worker = OrigWorker;
    }
  });

  // --------------------------------------------------------------------------
  // (و) AIOutputVerifier: Identical audio output in denoise succeeds with unchanged=true
  // --------------------------------------------------------------------------
  it("should succeed with data.unchanged=true and Arabic notice when audio denoise output equals input", () => {
    const cleanAudioUri = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
    const resultObj: any = {
      enhancedAudioUrlOrBase64: cleanAudioUri,
      processedAudioUrlOrBase64: cleanAudioUri,
      mimeType: "audio/wav",
    };

    const verification = AIOutputVerifier.verify(
      "denoise",
      { audioBase64OrUrl: cleanAudioUri },
      resultObj,
      "audio"
    );

    expect(verification.passed).toBe(true);
    expect(verification.unchanged).toBe(true);
    expect(resultObj.unchanged).toBe(true);
    expect(resultObj.message).toBe("لم تُكتشف ضوضاء تستحق التنقية");

    // Non-denoise audio task (e.g. stem separation) with identical output still fails
    const sepVerification = AIOutputVerifier.verify(
      "separate",
      { audioBase64OrUrl: cleanAudioUri },
      { enhancedAudioUrlOrBase64: cleanAudioUri },
      "audio"
    );
    expect(sepVerification.passed).toBe(false);
  });
});
