export interface AIDebugLogEntry {
  id: string;
  timestamp: string;
  taskId: string;
  providerId: string;
  modelName: string;
  rawPrompt: string;
  finalPrompt: string;
  negativePrompt?: string;
  parameters: Record<string, any>;
  executionTimeMs?: number;
  status: "success" | "error" | "pending";
  errorDetails?: string;
  stackTrace?: string;
  resultUrl?: string;
}

export class AIDebugLogger {
  private static instance: AIDebugLogger;
  private logs: AIDebugLogEntry[] = [];
  private maxLogs = 100;

  private constructor() {
    if (typeof window !== "undefined") {
      (window as any).__VIREON_AI_DEBUG__ = this;
    }
  }

  public static getInstance(): AIDebugLogger {
    if (!AIDebugLogger.instance) {
      AIDebugLogger.instance = new AIDebugLogger();
    }
    return AIDebugLogger.instance;
  }

  /**
   * Log internal pipeline execution stage (Console-only, invisible to end user)
   */
  public logStage(stage: string, meta?: Record<string, any>): void {
    if (typeof window !== "undefined") {
      const memory = (performance as any)?.memory
        ? `${Math.round((performance as any).memory.usedJSHeapSize / 1048576)}MB`
        : "N/A";
      console.log(
        `%c[AI PIPELINE STAGE] %c${stage}`,
        "color: #8b5cf6; font-weight: bold;",
        "color: #3b82f6; font-weight: bold;",
        meta ? meta : "",
        `[Memory: ${memory}]`
      );
    }
  }

  /**
   * Log error with stack trace internally (Console-only)
   */
  public logError(stage: string, err: any, meta?: Record<string, any>): void {
    if (typeof window !== "undefined") {
      console.groupCollapsed(
        `%c[AI ERROR STAGE] %c${stage}`,
        "color: #ef4444; font-weight: bold;",
        "color: #f87171;"
      );
      console.error("Error Object:", err);
      if (err?.stack) {
        console.error("Stack Trace:\n", err.stack);
      }
      if (meta) {
        console.log("Metadata:", meta);
      }
      console.groupEnd();
    }
  }

  public log(entry: Omit<AIDebugLogEntry, "id" | "timestamp">): AIDebugLogEntry {
    const fullEntry: AIDebugLogEntry = {
      ...entry,
      id: `dbg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    this.logs.unshift(fullEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    // Console output for internal developer inspection (Non-UI)
    if (typeof window !== "undefined") {
      console.groupCollapsed(
        `%c[AI-DEBUG] ${fullEntry.providerId.toUpperCase()} | ${fullEntry.status.toUpperCase()} (${fullEntry.executionTimeMs || 0}ms)`,
        `color: ${fullEntry.status === "success" ? "#10b981" : fullEntry.status === "error" ? "#ef4444" : "#f59e0b"}; font-weight: bold;`
      );
      console.log("Model:", fullEntry.modelName);
      console.log("Raw User Prompt (Pre-merge):", fullEntry.rawPrompt);
      console.log("Final Sent Prompt (Post-merge):", fullEntry.finalPrompt);
      console.log("Negative Prompt:", fullEntry.negativePrompt || "(None)");
      console.log("Parameters:", fullEntry.parameters);
      if (fullEntry.errorDetails) {
        console.error("Provider Error:", fullEntry.errorDetails);
      }
      if (fullEntry.stackTrace) {
        console.error("Stack Trace:", fullEntry.stackTrace);
      }
      if (fullEntry.resultUrl) {
        console.log("Result Image URL:", fullEntry.resultUrl);
      }
      console.groupEnd();
    }

    return fullEntry;
  }

  public updateLog(id: string, updates: Partial<AIDebugLogEntry>): void {
    const index = this.logs.findIndex((l) => l.id === id);
    if (index !== -1) {
      this.logs[index] = { ...this.logs[index], ...updates };
      const updated = this.logs[index];

      if (typeof window !== "undefined") {
        console.groupCollapsed(
          `%c[AI-DEBUG UPDATE] ${updated.providerId.toUpperCase()} | ${updated.status.toUpperCase()} (${updated.executionTimeMs || 0}ms)`,
          `color: ${updated.status === "success" ? "#10b981" : "#ef4444"}; font-weight: bold;`
        );
        console.log("Raw User Prompt:", updated.rawPrompt);
        console.log("Final Sent Prompt:", updated.finalPrompt);
        console.log("Parameters:", updated.parameters);
        if (updated.errorDetails) console.error("Error:", updated.errorDetails);
        if (updated.resultUrl) console.log("Result URL:", updated.resultUrl);
        console.groupEnd();
      }
    }
  }

  public getLogs(): AIDebugLogEntry[] {
    return [...this.logs];
  }

  public getLatestLog(): AIDebugLogEntry | undefined {
    return this.logs[0];
  }

  public clearLogs(): void {
    this.logs = [];
  }
}

export const aiDebugLogger = AIDebugLogger.getInstance();
