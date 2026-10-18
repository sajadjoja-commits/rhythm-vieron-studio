import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProjectRecoveryService } from "../ProjectRecoveryService";

describe("Phase 9: Project Crash Recovery & Ledger Service", () => {
  let recoveryService: ProjectRecoveryService;

  beforeEach(() => {
    localStorage.clear();
    recoveryService = ProjectRecoveryService.getInstance();
    vi.clearAllMocks();
  });

  it("detects an uncompleted session as a crash state", () => {
    recoveryService.startProjectSession("proj_crash_1", "Action Video");
    recoveryService.saveSnapshot("proj_crash_1", "Action Video", {
      clips: [{ id: "c1", in: 0, out: 5 }],
      captions: [{ id: "cap1", text: "Hello" }],
    });

    // Simulating app abruptly closed without calling recordCleanExit()
    const check = recoveryService.checkForRecovery();
    expect(check.hasCrashState).toBe(true);
    expect(check.projectId).toBe("proj_crash_1");
    expect(check.projectName).toBe("Action Video");
    expect(check.snapshot?.clipsCount).toBe(1);
    expect(check.snapshot?.captionsCount).toBe(1);
  });

  it("does NOT trigger crash recovery if session had a clean exit", () => {
    recoveryService.startProjectSession("proj_clean_1", "Clean Project");
    recoveryService.saveSnapshot("proj_clean_1", "Clean Project", { clips: [] });
    recoveryService.recordCleanExit();

    const check = recoveryService.checkForRecovery();
    expect(check.hasCrashState).toBe(false);
  });

  it("retrieves recovery data for restoration", () => {
    recoveryService.startProjectSession("proj_restore_1", "Restoration Test");
    const testPayload = { clips: [{ id: "c1" }], filters: [] };
    recoveryService.saveSnapshot("proj_restore_1", "Restoration Test", testPayload);

    const data = recoveryService.getRecoveryData("proj_restore_1");
    expect(data).toBeDefined();
    expect(data?.projectId).toBe("proj_restore_1");
    expect(data?.payload).toEqual(testPayload);
  });

  it("dismisses recovery state when user declines or finishes recovery", () => {
    recoveryService.startProjectSession("proj_dismiss_1", "Dismiss Test");
    recoveryService.saveSnapshot("proj_dismiss_1", "Dismiss Test", { clips: [] });

    expect(recoveryService.checkForRecovery().hasCrashState).toBe(true);

    recoveryService.dismissRecovery();
    expect(recoveryService.checkForRecovery().hasCrashState).toBe(false);
  });
});
