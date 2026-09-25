/**
 * Phase 9: Project Crash Recovery & State Resiliency Service
 * 
 * Provides bulletproof protection against unexpected app terminations:
 * - Maintains a synchronous ledger of project state and active operations.
 * - Flags uncommitted or dirty states to detect crashes on subsequent launches.
 * - Stores fast snapshots of timeline clips, captions, and project config.
 * - Automatically purges orphaned files (stale exports, temp bitmaps, unfinished proxies).
 * - Restores project state safely upon user confirmation or seamless resume.
 */

import { storageCacheService } from "../media/StorageCacheService";

export interface ProjectRecoverySnapshot {
  projectId: string;
  projectName: string;
  timestamp: number;
  clipsCount: number;
  captionsCount: number;
  payload: any;
}

export interface ProjectRecoveryLedger {
  activeProjectId: string;
  projectName: string;
  lastHeartbeat: number;
  cleanExit: boolean;
  uncompletedOperations: string[];
  snapshot?: ProjectRecoverySnapshot;
}

const LEDGER_STORAGE_KEY = "vieron_recovery_ledger";
const RECOVERY_SNAPSHOT_KEY = "vieron_recovery_snapshot_";

export class ProjectRecoveryService {
  private static instance: ProjectRecoveryService;
  private currentLedger: ProjectRecoveryLedger | null = null;
  private heartbeatInterval: any = null;

  private constructor() {
    this.setupProcessLifecycleHooks();
  }

  public static getInstance(): ProjectRecoveryService {
    if (!ProjectRecoveryService.instance) {
      ProjectRecoveryService.instance = new ProjectRecoveryService();
    }
    return ProjectRecoveryService.instance;
  }

  /**
   * Initializes or attaches to the active project session
   */
  public startProjectSession(projectId: string, projectName = "Untitled Project"): void {
    this.currentLedger = {
      activeProjectId: projectId,
      projectName,
      lastHeartbeat: Date.now(),
      cleanExit: false, // will be marked true on normal close/exit
      uncompletedOperations: [],
    };
    this.persistLedger();
    this.startHeartbeat();
  }

  /**
   * Records a snapshot of timeline and project data
   */
  public saveSnapshot(projectId: string, projectName: string, state: any): void {
    const snapshot: ProjectRecoverySnapshot = {
      projectId,
      projectName,
      timestamp: Date.now(),
      clipsCount: Array.isArray(state?.clips) ? state.clips.length : 0,
      captionsCount: Array.isArray(state?.captions) ? state.captions.length : 0,
      payload: state,
    };

    if (this.currentLedger && this.currentLedger.activeProjectId === projectId) {
      this.currentLedger.snapshot = snapshot;
      this.currentLedger.lastHeartbeat = Date.now();
      this.persistLedger();
    }

    try {
      localStorage.setItem(
        `${RECOVERY_SNAPSHOT_KEY}${projectId}`,
        JSON.stringify(snapshot)
      );
    } catch (e) {
      console.warn("[ProjectRecoveryService] Failed to write recovery snapshot to localStorage:", e);
    }
  }

  /**
   * Inspects the ledger to determine if the prior session terminated abnormally
   */
  public checkForRecovery(): {
    hasCrashState: boolean;
    projectId?: string;
    projectName?: string;
    timestamp?: number;
    snapshot?: ProjectRecoverySnapshot;
  } {
    try {
      const raw = localStorage.getItem(LEDGER_STORAGE_KEY);
      if (!raw) return { hasCrashState: false };

      const ledger: ProjectRecoveryLedger = JSON.parse(raw);
      // If previous session did not register cleanExit and has a snapshot
      if (!ledger.cleanExit && ledger.snapshot && ledger.snapshot.timestamp) {
        return {
          hasCrashState: true,
          projectId: ledger.activeProjectId,
          projectName: ledger.projectName,
          timestamp: ledger.snapshot.timestamp,
          snapshot: ledger.snapshot,
        };
      }
    } catch (err) {
      console.warn("[ProjectRecoveryService] Error checking recovery ledger:", err);
    }

    return { hasCrashState: false };
  }

  /**
   * Retrieves the recovery snapshot data for project restoration
   */
  public getRecoveryData(projectId: string): ProjectRecoverySnapshot | null {
    try {
      const raw = localStorage.getItem(`${RECOVERY_SNAPSHOT_KEY}${projectId}`);
      if (raw) return JSON.parse(raw);
    } catch {}

    if (this.currentLedger?.snapshot?.projectId === projectId) {
      return this.currentLedger.snapshot;
    }

    return null;
  }

  /**
   * Marks the current session as safely concluded
   */
  public recordCleanExit(): void {
    if (this.currentLedger) {
      this.currentLedger.cleanExit = true;
      this.currentLedger.uncompletedOperations = [];
      this.persistLedger();
    }
    this.stopHeartbeat();
  }

  /**
   * Dismisses recovery state (user rejected recovery or clean state verified)
   */
  public dismissRecovery(): void {
    try {
      localStorage.removeItem(LEDGER_STORAGE_KEY);
    } catch {}
  }

  /**
   * Cleans orphaned temporary files and unfinished artifacts from aborted sessions
   */
  public async cleanupOrphanedFiles(): Promise<{ freedBytes: number }> {
    try {
      const res = await storageCacheService.cleanCache("temp");
      return { freedBytes: res.freedBytes };
    } catch (err) {
      console.warn("[ProjectRecoveryService] Failed to clean orphaned files:", err);
      return { freedBytes: 0 };
    }
  }

  private persistLedger(): void {
    if (!this.currentLedger) return;
    try {
      localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(this.currentLedger));
    } catch {}
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.currentLedger) {
        this.currentLedger.lastHeartbeat = Date.now();
        this.persistLedger();
      }
    }, 10000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private setupProcessLifecycleHooks(): void {
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", () => this.recordCleanExit());
      window.addEventListener("beforeunload", () => this.recordCleanExit());
    }
  }
}

export const projectRecoveryService = ProjectRecoveryService.getInstance();
