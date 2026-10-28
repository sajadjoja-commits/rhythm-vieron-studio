import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyProcessedVideoSource } from "./processedVideoPreview";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function mockProbe(valid: boolean) {
  const probe = document.createElement("video");
  Object.defineProperties(probe, {
    videoWidth: { value: valid ? 320 : 0 },
    videoHeight: { value: valid ? 180 : 0 },
    duration: { value: valid ? 2 : NaN },
  });
  const load = vi.spyOn(probe, "load").mockImplementation(() => {
    if (probe.hasAttribute("src")) queueMicrotask(() => probe.dispatchEvent(new Event("loadedmetadata")));
  });
  vi.spyOn(document, "createElement").mockReturnValue(probe);
  return { probe, load };
}

describe("Processed video preview validation", () => {
  it("accepts a decodable replacement and releases the probe source", async () => {
    const { probe, load } = mockProbe(true);
    await expect(verifyProcessedVideoSource("blob:replacement")).resolves.toBeUndefined();
    expect(probe.hasAttribute("src")).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid output before it can replace project media", async () => {
    const { probe } = mockProbe(false);
    await expect(verifyProcessedVideoSource("blob:corrupt")).rejects.toThrow("invalid dimensions");
    expect(probe.hasAttribute("src")).toBe(false);
  });
  it("rejects stalled metadata and cleans up", async () => {
    vi.useFakeTimers();
    const { probe, load } = mockProbe(true);
    load.mockImplementation(() => {});
    const assertion = expect(verifyProcessedVideoSource("blob:stalled", 50)).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(probe.hasAttribute("src")).toBe(false);
  });
});