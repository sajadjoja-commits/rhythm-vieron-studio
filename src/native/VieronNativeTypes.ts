/**
 * VieronNative TypeScript Types and Interfaces
 */

export type VieronFileRoot = "APP" | "CACHE" | "MEDIA" | "MODELS" | "TEMP";

export interface VieronNativeResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  ok?: boolean; // Backward compatibility
}

export interface FsReadRequest {
  root: VieronFileRoot;
  path: string;
}

export interface FsWriteRequest {
  root: VieronFileRoot;
  path: string;
  data: string; // Base64 or UTF-8 text depending on operation
  append?: boolean;
}

export interface FsDeleteRequest {
  root: VieronFileRoot;
  path: string;
}

export interface FsExistsRequest {
  root: VieronFileRoot;
  path: string;
}

export interface FsMkdirRequest {
  root: VieronFileRoot;
  path: string;
  recursive?: boolean;
}

export interface FsListRequest {
  root: VieronFileRoot;
  path: string;
}

export interface FsStatRequest {
  root: VieronFileRoot;
  path: string;
}
