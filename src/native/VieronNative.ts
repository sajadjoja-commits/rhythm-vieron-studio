/**
 * VieronNative TypeScript Client Wrapper
 * Communicates with VieronNativeBridgeImpl via Android @JavascriptInterface
 * Includes automatic fallback to Capacitor plugins during migration.
 */
import { Filesystem, Directory } from '@capacitor/filesystem';
import { VieronNativeResponse, FsReadRequest, FsWriteRequest, FsDeleteRequest, FsExistsRequest, FsMkdirRequest, FsListRequest, FsStatRequest } from './VieronNativeTypes';

class VieronNativeClient {
  private getBridge(): any {
    if (typeof window !== "undefined") {
      return (window as any).VieronNativeBridgeImpl;
    }
    return null;
  }

  private callBridge(method: string, ...args: any[]): any {
    const bridge = this.getBridge();
    if (bridge && typeof bridge[method] === "function") {
      try {
        const raw = bridge[method](...args);
        const res = typeof raw === "string" ? JSON.parse(raw) : raw;
        console.log(`[VIERON-NATIVE] method=${method} native=true`, res);
        return res;
      } catch (e: any) {
        console.warn(`[VIERON-NATIVE] method=${method} native=exception`, e);
        return { success: false, ok: false, error: { code: "BRIDGE_EXCEPTION", message: e.message } };
      }
    }
    console.log(`[VIERON-NATIVE] method=${method} native=false (bridge not found)`);
    return { success: false, ok: false, error: { code: "BRIDGE_UNAVAILABLE", message: "Native bridge not available" } };
  }

  // ==================== FILESYSTEM ====================
  private mapRootToCapacitorDirectory(root: string): Directory {
    switch (root.toUpperCase()) {
      case "CACHE": return Directory.Cache;
      case "MEDIA": return Directory.Documents;
      case "MODELS": return Directory.Data;
      case "TEMP": return Directory.Cache;
      case "APP":
      default:
        return Directory.Data;
    }
  }

  public fs = {
    read: async (req: FsReadRequest): Promise<VieronNativeResponse> => {
      const res = this.callBridge("fs_read", JSON.stringify(req));
      if (res.success || res.ok) return res;
      // TEMPORARY_CAPACITOR_FALLBACK // REMOVE_IN_PHASE_3
      try {
        console.log("[VIERON-NATIVE] Falling back to Capacitor Filesystem.read");
        const capRes = await Filesystem.readFile({
          path: req.path,
          directory: this.mapRootToCapacitorDirectory(req.root),
          encoding: 'utf8' as any
        });
        return { success: true, ok: true, data: { content: capRes.data, size: typeof capRes.data === 'string' ? capRes.data.length : 0 } };
      } catch (e: any) {
        return { success: false, ok: false, error: { code: "FALLBACK_FAILED", message: e.message } };
      }
    },

    write: async (req: FsWriteRequest): Promise<VieronNativeResponse> => {
      const res = this.callBridge("fs_write", JSON.stringify(req));
      if (res.success || res.ok) return res;
      // TEMPORARY_CAPACITOR_FALLBACK // REMOVE_IN_PHASE_3
      try {
        console.log("[VIERON-NATIVE] Falling back to Capacitor Filesystem.writeFile");
        const capRes = await Filesystem.writeFile({
          path: req.path,
          data: req.data,
          directory: this.mapRootToCapacitorDirectory(req.root),
          recursive: true
        });
        return { success: true, ok: true, data: { path: capRes.uri, bytesWritten: req.data.length } };
      } catch (e: any) {
        return { success: false, ok: false, error: { code: "FALLBACK_FAILED", message: e.message } };
      }
    },

    delete: async (req: FsDeleteRequest): Promise<VieronNativeResponse> => {
      const res = this.callBridge("fs_delete", JSON.stringify(req));
      if (res.success || res.ok) return res;
      // TEMPORARY_CAPACITOR_FALLBACK // REMOVE_IN_PHASE_3
      try {
        await Filesystem.deleteFile({
          path: req.path,
          directory: this.mapRootToCapacitorDirectory(req.root)
        });
        return { success: true, ok: true, data: { deleted: true } };
      } catch (e: any) {
        return { success: false, ok: false, error: { code: "FALLBACK_FAILED", message: e.message } };
      }
    },

    exists: async (req: FsExistsRequest): Promise<VieronNativeResponse> => {
      const res = this.callBridge("fs_exists", JSON.stringify(req));
      if (res.success || res.ok) return res;
      return { success: true, ok: true, data: { exists: false } };
    },

    mkdir: async (req: FsMkdirRequest): Promise<VieronNativeResponse> => {
      const res = this.callBridge("fs_mkdir", JSON.stringify(req));
      if (res.success || res.ok) return res;
      try {
        await Filesystem.mkdir({
          path: req.path,
          directory: this.mapRootToCapacitorDirectory(req.root),
          recursive: req.recursive ?? true
        });
        return { success: true, ok: true, data: { created: true } };
      } catch (e: any) {
        return { success: false, ok: false, error: { code: "FALLBACK_FAILED", message: e.message } };
      }
    },

    list: async (req: FsListRequest): Promise<VieronNativeResponse> => {
      const res = this.callBridge("fs_list", JSON.stringify(req));
      if (res.success || res.ok) return res;
      try {
        const listRes = await Filesystem.readdir({
          path: req.path,
          directory: this.mapRootToCapacitorDirectory(req.root)
        });
        return { success: true, ok: true, data: { files: listRes.files } };
      } catch (e: any) {
        return { success: false, ok: false, error: { code: "FALLBACK_FAILED", message: e.message } };
      }
    },

    stat: async (req: FsStatRequest): Promise<VieronNativeResponse> => {
      const res = this.callBridge("fs_stat", JSON.stringify(req));
      if (res.success || res.ok) return res;
      try {
        const statRes = await Filesystem.stat({
          path: req.path,
          directory: this.mapRootToCapacitorDirectory(req.root)
        });
        return { success: true, ok: true, data: { size: statRes.size, lastModified: statRes.mtime } };
      } catch (e: any) {
        return { success: false, ok: false, error: { code: "FALLBACK_FAILED", message: e.message } };
      }
    }
  };

  public app = {
    getRuntimeInfo: async (): Promise<VieronNativeResponse> => this.callBridge("app_getRuntimeInfo"),
    getAppVersion: async (): Promise<VieronNativeResponse> => this.callBridge("app_getAppVersion"),
    getBuildInfo: async (): Promise<VieronNativeResponse> => this.callBridge("app_getBuildInfo"),
  };

  public whisper = {
    getStatus: async (): Promise<VieronNativeResponse> => this.callBridge("whisper_getStatus"),
    isModelAvailable: async (modelId: string): Promise<VieronNativeResponse> => this.callBridge("whisper_isModelAvailable", modelId),
    downloadModel: async (modelId: string): Promise<VieronNativeResponse> => this.callBridge("whisper_downloadModel", modelId),
    transcribe: async (request: any): Promise<VieronNativeResponse> => this.callBridge("whisper_transcribe", JSON.stringify(request)),
    cancel: async (requestId: string): Promise<VieronNativeResponse> => this.callBridge("whisper_cancel", requestId),
    getModelInfo: async (): Promise<VieronNativeResponse> => this.callBridge("whisper_getModelInfo"),
  };

  public media = {
    getMetadata: async (uri: string): Promise<VieronNativeResponse> => this.callBridge("media_getMetadata", uri),
    createThumbnail: async (uri: string, options?: any): Promise<VieronNativeResponse> => this.callBridge("media_createThumbnail", uri, JSON.stringify(options || {})),
    createWaveform: async (uri: string, options?: any): Promise<VieronNativeResponse> => this.callBridge("media_createWaveform", uri, JSON.stringify(options || {})),
    export: async (request: any): Promise<VieronNativeResponse> => this.callBridge("media_export", JSON.stringify(request)),
    cancelExport: async (requestId: string): Promise<VieronNativeResponse> => this.callBridge("media_cancelExport", requestId),
  };

  public ai = {
    removeBackground: async (options?: any): Promise<VieronNativeResponse> => this.callBridge("ai_removeBackground", JSON.stringify(options || {})),
    detectFaces: async (options?: any): Promise<VieronNativeResponse> => this.callBridge("ai_detectFaces", JSON.stringify(options || {})),
    processImage: async (options?: any): Promise<VieronNativeResponse> => this.callBridge("ai_processImage", JSON.stringify(options || {})),
    getModelStatus: async (model: string): Promise<VieronNativeResponse> => this.callBridge("ai_getModelStatus", model),
    getCapabilities: async (): Promise<VieronNativeResponse> => this.callBridge("ai_getCapabilities"),
  };

  public camera = {
    isAvailable: async (): Promise<VieronNativeResponse> => this.callBridge("camera_isAvailable"),
    takePicture: async (options?: any): Promise<VieronNativeResponse> => this.callBridge("camera_takePicture", JSON.stringify(options || {})),
  };

  public storage = {
    getProjects: async (): Promise<VieronNativeResponse> => this.callBridge("storage_getProjects"),
    saveProject: async (project: any): Promise<VieronNativeResponse> => this.callBridge("storage_saveProject", JSON.stringify(project)),
    deleteProject: async (projectId: string): Promise<VieronNativeResponse> => this.callBridge("storage_deleteProject", projectId),
  };

  public models = {
    getCatalog: async (): Promise<VieronNativeResponse> => this.callBridge("models_getCatalog"),
    downloadModel: async (modelId: string): Promise<VieronNativeResponse> => this.callBridge("models_downloadModel", modelId),
    deleteModel: async (modelId: string): Promise<VieronNativeResponse> => this.callBridge("models_deleteModel", modelId),
  };

  public background = {
    createJob: async (job: any): Promise<VieronNativeResponse> => this.callBridge("background_createJob", JSON.stringify(job)),
    getJobStatus: async (jobId: string): Promise<VieronNativeResponse> => this.callBridge("background_getJobStatus", jobId),
    cancelJob: async (jobId: string): Promise<VieronNativeResponse> => this.callBridge("background_cancelJob", jobId),
  };

  public export = {
    startExport: async (request: any): Promise<VieronNativeResponse> => this.callBridge("export_startExport", JSON.stringify(request)),
    cancelExport: async (exportId: string): Promise<VieronNativeResponse> => this.callBridge("export_cancelExport", exportId),
  };
}

export const vieronNative = new VieronNativeClient();

if (typeof window !== "undefined") {
  (window as any).VieronNative = (window as any).VieronNative || vieronNative;
}
