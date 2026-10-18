import {
  WorkflowDefinition,
  WorkflowRunOptions,
  WorkflowRunProgress,
  WorkflowRunStatus,
  WorkflowStepConfig,
  WorkflowStepState,
  AIWorkflowEngineResponse,
} from "./types";
import { prebuiltWorkflows } from "./prebuiltWorkflows";
import { aiPlugins } from "../plugins";

interface ActiveExecutionState {
  runId: string;
  workflowDef: WorkflowDefinition;
  status: WorkflowRunStatus;
  currentStepIndex: number;
  initialInput: any;
  options: WorkflowRunOptions;
  stepStates: Record<string, WorkflowStepState>;
  stepOutputs: Record<string, any>;
  lastStepResult: any;
  isPausedRequested: boolean;
  isCancelledRequested: boolean;
}

export class AIWorkflowEngine {
  private registeredWorkflows: Map<string, WorkflowDefinition> = new Map();
  private activeExecutions: Map<string, ActiveExecutionState> = new Map();

  constructor() {
    this.registerPrebuiltWorkflows();
  }

  private registerPrebuiltWorkflows(): void {
    prebuiltWorkflows.forEach((wf) => {
      this.registerWorkflow(wf);
    });
  }

  public registerWorkflow(definition: WorkflowDefinition): void {
    this.registeredWorkflows.set(definition.id, definition);
  }

  public getWorkflow(id: string): WorkflowDefinition | undefined {
    return this.registeredWorkflows.get(id);
  }

  public listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.registeredWorkflows.values());
  }

  public getRunProgress(runId: string): WorkflowRunProgress | undefined {
    const exec = this.activeExecutions.get(runId);
    if (!exec) return undefined;

    const currentStep = exec.workflowDef.steps[exec.currentStepIndex];
    return {
      workflowId: exec.workflowDef.id,
      workflowName: exec.workflowDef.name,
      runId: exec.runId,
      status: exec.status,
      currentStepIndex: exec.currentStepIndex,
      totalSteps: exec.workflowDef.steps.length,
      currentStepName: currentStep ? currentStep.name : "Finished",
      stepStates: { ...exec.stepStates },
      stepOutputs: { ...exec.stepOutputs },
      finalResult: exec.lastStepResult,
    };
  }

  public pauseWorkflow(runId: string): boolean {
    const exec = this.activeExecutions.get(runId);
    if (exec && exec.status === "running") {
      exec.isPausedRequested = true;
      exec.status = "paused";
      return true;
    }
    return false;
  }

  public cancelWorkflow(runId: string): boolean {
    const exec = this.activeExecutions.get(runId);
    if (exec) {
      exec.isCancelledRequested = true;
      exec.status = "cancelled";
      return true;
    }
    return false;
  }

  public async resumeWorkflow<TResult = any>(runId: string): Promise<AIWorkflowEngineResponse<TResult>> {
    const exec = this.activeExecutions.get(runId);
    if (!exec) {
      return {
        success: false,
        providerUsed: "workflow-engine",
        error: { code: "RUN_NOT_FOUND", message: `Workflow run [${runId}] not found.` },
      };
    }

    if (exec.status !== "paused" && exec.status !== "failed") {
      return {
        success: false,
        providerUsed: "workflow-engine",
        error: { code: "INVALID_STATUS", message: `Workflow [${runId}] is in state '${exec.status}' and cannot be resumed.` },
      };
    }

    exec.isPausedRequested = false;
    exec.isCancelledRequested = false;
    exec.status = "running";

    return this.runExecutionLoop<TResult>(exec);
  }

  public async retryStep<TResult = any>(
    runId: string,
    stepIndex?: number
  ): Promise<AIWorkflowEngineResponse<TResult>> {
    const exec = this.activeExecutions.get(runId);
    if (!exec) {
      return {
        success: false,
        providerUsed: "workflow-engine",
        error: { code: "RUN_NOT_FOUND", message: `Workflow run [${runId}] not found.` },
      };
    }

    const targetIndex = stepIndex !== undefined ? stepIndex : exec.currentStepIndex;
    if (targetIndex < 0 || targetIndex >= exec.workflowDef.steps.length) {
      return {
        success: false,
        providerUsed: "workflow-engine",
        error: { code: "INVALID_STEP_INDEX", message: `Invalid step index ${targetIndex}` },
      };
    }

    exec.currentStepIndex = targetIndex;
    const step = exec.workflowDef.steps[targetIndex];
    exec.stepStates[step.id] = {
      stepId: step.id,
      stepName: step.name,
      status: "pending",
    };

    exec.isPausedRequested = false;
    exec.isCancelledRequested = false;
    exec.status = "running";

    return this.runExecutionLoop<TResult>(exec);
  }

  public async executeWorkflow<TPayload = any, TResult = any>(
    workflowIdOrDef: string | WorkflowDefinition,
    input: TPayload,
    options?: WorkflowRunOptions
  ): Promise<AIWorkflowEngineResponse<TResult>> {
    let definition: WorkflowDefinition | undefined;
    if (typeof workflowIdOrDef === "string") {
      definition = this.getWorkflow(workflowIdOrDef);
      if (!definition) {
        return {
          success: false,
          providerUsed: "workflow-engine",
          error: {
            code: "WORKFLOW_NOT_FOUND",
            message: `Workflow definition [${workflowIdOrDef}] not registered.`,
          },
        };
      }
    } else {
      definition = workflowIdOrDef;
    }

    const runId = options?.runId || `wf_run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const stepStates: Record<string, WorkflowStepState> = {};
    definition.steps.forEach((step) => {
      stepStates[step.id] = {
        stepId: step.id,
        stepName: step.name,
        status: "pending",
      };
    });

    const execState: ActiveExecutionState = {
      runId,
      workflowDef: definition,
      status: "running",
      currentStepIndex: options?.startStepIndex || 0,
      initialInput: input,
      options: options || {},
      stepStates,
      stepOutputs: {},
      lastStepResult: input,
      isPausedRequested: false,
      isCancelledRequested: false,
    };

    this.activeExecutions.set(runId, execState);
    return this.runExecutionLoop<TResult>(execState);
  }

  private async runExecutionLoop<TResult = any>(
    exec: ActiveExecutionState
  ): Promise<AIWorkflowEngineResponse<TResult>> {
    const { AIRuntime } = await import("../runtime/AIRuntime");
    const runtime = AIRuntime.getInstance();
    const { workflowDef, runId, options } = exec;
    const steps = workflowDef.steps;
    const startTime = Date.now();

    while (exec.currentStepIndex < steps.length) {
      if (exec.isCancelledRequested) {
        exec.status = "cancelled";
        runtime.progressManager.updateProgress(runId, 0, "Workflow cancelled", "failed");
        return {
          success: false,
          providerUsed: "workflow-engine",
          workflowRunId: runId,
          error: { code: "CANCELLED", message: "Workflow was cancelled by user." },
        };
      }

      if (exec.isPausedRequested) {
        exec.status = "paused";
        runtime.progressManager.updateProgress(
          runId,
          Math.floor((exec.currentStepIndex / steps.length) * 100),
          `Paused at step ${exec.currentStepIndex + 1}: ${steps[exec.currentStepIndex].name}`,
          "processing"
        );
        return {
          success: false,
          providerUsed: "workflow-engine",
          workflowRunId: runId,
          error: { code: "PAUSED", message: `Workflow paused at step ${exec.currentStepIndex + 1}` },
        };
      }

      const stepIndex = exec.currentStepIndex;
      const step: WorkflowStepConfig = steps[stepIndex];
      const stepStartTime = Date.now();

      // Update progress
      const progressPercent = Math.floor((stepIndex / steps.length) * 100);
      runtime.progressManager.updateProgress(
        runId,
        progressPercent,
        `Step ${stepIndex + 1}/${steps.length}: ${step.name}`,
        "processing"
      );

      exec.stepStates[step.id] = {
        stepId: step.id,
        stepName: step.name,
        status: "running",
      };

      // Prepare payload for step
      let stepInput: any;
      if (step.inputMapper) {
        stepInput = step.inputMapper(exec.lastStepResult, exec.initialInput);
      } else if (stepIndex === 0) {
        stepInput = exec.initialInput;
      } else {
        stepInput = exec.lastStepResult;
      }

      if (step.params && typeof stepInput === "object" && stepInput !== null) {
        stepInput = { ...step.params, ...stepInput };
      } else if (step.params && typeof stepInput === "string") {
        stepInput = { ...step.params, imageBase64OrUrl: stepInput, videoBase64OrUrl: stepInput, audioBase64OrUrl: stepInput };
      }

      // 1. Check AICache
      const inputHash = runtime.aiManager.cache.generateHash(`${step.pluginId}_${step.actionName}`, stepInput);
      let stepResultData: any = null;
      let stepSuccess = false;
      let errorMsg: string | undefined;

      if (options.enableCache !== false) {
        const cachedMatch = runtime.historyManager.findMatch(step.actionName as any, inputHash);
        if (cachedMatch && cachedMatch.resultData) {
          stepResultData = cachedMatch.resultData;
          stepSuccess = true;
        }
      }

      // 2. Execute step if not cached
      if (!stepSuccess) {
        const plugin = aiPlugins.getPlugin(step.pluginId);

        // Auto-detect execution mode based on device profile if not explicitly specified
        const deviceProfile = runtime.getDeviceProfile();
        const preferredMode = options.executionMode || (deviceProfile.hasWASM && !deviceProfile.isAndroid ? "local" : "remote");

        if (plugin) {
          const res = await plugin.execute(step.actionName, stepInput, {
            ...options,
            executionMode: preferredMode,
          });

          if (res.success && res.data) {
            stepResultData = res.data;
            stepSuccess = true;
          } else {
            errorMsg = res.error?.message || `Step [${step.name}] failed.`;
          }
        } else {
          // Fallback to runtime task execution
          const res = await runtime.runTask(step.actionName as any, stepInput, {
            ...options,
            executionMode: preferredMode,
          });

          if (res.success && res.data) {
            stepResultData = res.data;
            stepSuccess = true;
          } else {
            errorMsg = res.error?.message || `Step [${step.name}] failed via task fallback.`;
          }
        }
      }

      const stepTimeMs = Date.now() - stepStartTime;

      if (stepSuccess && stepResultData) {
        const finalStepData = step.outputMapper ? step.outputMapper(stepResultData) : stepResultData;

        exec.stepStates[step.id] = {
          stepId: step.id,
          stepName: step.name,
          status: "completed",
          executionTimeMs: stepTimeMs,
          output: finalStepData,
        };

        exec.stepOutputs[step.id] = finalStepData;
        exec.lastStepResult = finalStepData;

        // Log step in history manager
        runtime.historyManager.recordJob(
          step.actionName as any,
          step.pluginId,
          stepTimeMs,
          inputHash,
          true,
          `Workflow [${workflowDef.name}] - Step ${stepIndex + 1}: ${step.name}`,
          "Completed",
          finalStepData
        );

        exec.currentStepIndex++;
      } else {
        exec.stepStates[step.id] = {
          stepId: step.id,
          stepName: step.name,
          status: "failed",
          executionTimeMs: stepTimeMs,
          error: errorMsg,
        };
        exec.status = "failed";

        runtime.progressManager.updateProgress(
          runId,
          progressPercent,
          `Failed at step ${stepIndex + 1}: ${step.name}`,
          "failed"
        );

        const stepsSummary = Object.values(exec.stepStates).map((s) => ({
          stepId: s.stepId,
          stepName: s.stepName,
          success: s.status === "completed",
          timeMs: s.executionTimeMs,
        }));

        return {
          success: false,
          providerUsed: "workflow-engine",
          workflowRunId: runId,
          stepsSummary,
          error: {
            code: "STEP_FAILED",
            message: errorMsg || `Workflow failed at step ${stepIndex + 1}: ${step.name}`,
          },
        };
      }
    }

    // All steps completed successfully
    exec.status = "completed";
    runtime.progressManager.updateProgress(runId, 100, "Workflow Completed", "completed");

    const stepsSummary = Object.values(exec.stepStates).map((s) => ({
      stepId: s.stepId,
      stepName: s.stepName,
      success: s.status === "completed",
      timeMs: s.executionTimeMs,
    }));

    // Record complete workflow in history
    runtime.historyManager.recordJob(
      "enhance-media",
      "workflow-engine",
      Date.now() - startTime,
      runtime.aiManager.cache.generateHash(workflowDef.id, exec.initialInput),
      true,
      `Full Workflow: ${workflowDef.name}`,
      "Completed",
      exec.lastStepResult
    );

    return {
      success: true,
      data: exec.lastStepResult as TResult,
      providerUsed: "workflow-engine",
      executionTimeMs: Date.now() - startTime,
      workflowRunId: runId,
      stepsSummary,
    };
  }
}
