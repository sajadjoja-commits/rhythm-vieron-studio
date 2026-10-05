/**
 * VieronNative TypeScript Client Wrapper
 * Communicates with VieronNativeBridgeImpl via Android @JavascriptInterface
 */

export interface VieronResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

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
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch (e: any) {
        return { ok: false, error: { code: "BRIDGE_EXCEPTION", message: e.message } };
      }
    }
    return { ok: true, data: {} };
  }

  public app = {
    getRuntimeInfo: async (): Promise<VieronResponse> => this.callBridge("app_getRuntimeInfo"),
    getAppVersion: async (): Promise<VieronResponse> => this.callBridge("app_getAppVersion"),
    getBuildInfo: async (): Promise<VieronResponse> => this.callBridge("app_getBuildInfo"),
  };

  public whisper = {
    getStatus: async (): Promise<VieronResponse> => this.callBridge("whisper_getStatus"),
    isModelAvailable: async (modelId: string): Promise<VieronResponse> => this.callBridge("whisper_isModelAvailable", modelId),
    downloadModel: async (modelId: string): Promise<VieronResponse> => this.callBridge("whisper_downloadModel", modelId),
    transcribe: async (request: any): Promise<VieronResponse> => this.callBridge("whisper_transcribe", JSON.stringify(request)),
    cancel: async (requestId: string): Promise<VieronResponse> => this.callBridge("whisper_cancel", requestId),
    getModelInfo: async (): Promise<VieronResponse> => this.callBridge("whisper_getModelInfo"),
  };

  public media = {
    getMetadata: async (uri: string): Promise<VieronResponse> => this.callBridge("media_getMetadata", uri),
    createThumbnail: async (uri: string, options?: any): Promise<VieronResponse> => this.callBridge("media_createThumbnail", uri, JSON.stringify(options || {})),
    createWaveform: async (uri: string, options?: any): Promise<VieronResponse> => this.callBridge("media_createWaveform", uri, JSON.stringify(options || {})),
    export: async (request: any): Promise<VieronResponse> => this.callBridge("media_export", JSON.stringify(request)),
    cancelExport: async (requestId: string): Promise<VieronResponse> => this.callBridge("media_cancelExport", requestId),
  };

  public ai = {
    removeBackground: async (options?: any): Promise<VieronResponse> => this.callBridge("ai_removeBackground", JSON.stringify(options || {})),
    detectFaces: async (options?: any): Promise<VieronResponse> => this.callBridge("ai_detectFaces", JSON.stringify(options || {})),
    processImage: async (options?: any): Promise<VieronResponse> => this.callBridge("ai_processImage", JSON.stringify(options || {})),
    getModelStatus: async (model: string): Promise<VieronResponse> => this.callBridge("ai_getModelStatus", model),
    getCapabilities: async (): Promise<VieronResponse> => this.callBridge("ai_getCapabilities"),
  };

  public camera = {
    isAvailable: async (): Promise<VieronResponse> => this.callBridge("camera_isAvailable"),
    takePicture: async (options?: any): Promise<VieronResponse> => this.callBridge("camera_takePicture", JSON.stringify(options || {})),
  };

  public storage = {
    getProjects: async (): Promise<VieronResponse> => this.callBridge("storage_getProjects"),
    saveProject: async (project: any): Promise<VieronResponse> => this.callBridge("storage_saveProject", JSON.stringify(project)),
    deleteProject: async (projectId: string): Promise<VieronResponse> => this.callBridge("storage_deleteProject", projectId),
  };

  public models = {
    getCatalog: async (): Promise<VieronResponse> => this.callBridge("models_getCatalog"),
    downloadModel: async (modelId: string): Promise<VieronResponse> => this.callBridge("models_downloadModel", modelId),
    deleteModel: async (modelId: string): Promise<VieronResponse> => this.callBridge("models_deleteModel", modelId),
  };

  public background = {
    createJob: async (job: any): Promise<VieronResponse> => this.callBridge("background_createJob", JSON.stringify(job)),
    getJobStatus: async (jobId: string): Promise<VieronResponse> => this.callBridge("background_getJobStatus", jobId),
    cancelJob: async (jobId: string): Promise<VieronResponse> => this.callBridge("background_cancelJob", jobId),
  };

  public export = {
    startExport: async (request: any): Promise<VieronResponse> => this.callBridge("export_startExport", JSON.stringify(request)),
    cancelExport: async (exportId: string): Promise<VieronResponse> => this.callBridge("export_cancelExport", exportId),
  };
}

export const vieronNative = new VieronNativeClient();

if (typeof window !== "undefined") {
  (window as any).VieronNative = (window as any).VieronNative || vieronNative;
}
