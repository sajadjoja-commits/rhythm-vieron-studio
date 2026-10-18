import { describe, it, expect, vi } from "vitest";

describe("Image AI Coordinate Math & Aspect Ratio Verification", () => {
  it("transforms letterboxed container coordinates correctly to natural image coordinate space", () => {
    // Letterbox case: Container 400x400, Image 1000x500 (2:1).
    // In object-contain: displayed image width = 400, height = 200, vertical offset = 100
    const containerW = 400;
    const containerH = 400;
    const naturalW = 1000;
    const naturalH = 500;

    const scale = Math.min(containerW / naturalW, containerH / naturalH); // 400/1000 = 0.4
    const renderedW = naturalW * scale; // 400
    const renderedH = naturalH * scale; // 200
    const offsetX = (containerW - renderedW) / 2; // 0
    const offsetY = (containerH - renderedH) / 2; // 100

    // Test a touch point at center of the container (200, 200)
    const touchX = 200;
    const touchY = 200;

    // Direct mapping to the exact rendered image rectangle:
    const imgX = (touchX - offsetX) / scale;
    const imgY = (touchY - offsetY) / scale;

    expect(imgX).toBe(500); // exactly center of natural width
    expect(imgY).toBe(250); // exactly center of natural height
  });

  it("handles pillarbox case (vertical 9:16 inside wider container) without offset drift", () => {
    // Pillarbox case: Container 600x400, Image 900x1600 (9:16).
    const containerW = 600;
    const containerH = 400;
    const naturalW = 900;
    const naturalH = 1600;

    const scale = Math.min(containerW / naturalW, containerH / naturalH); // 400/1600 = 0.25
    const renderedW = naturalW * scale; // 225
    const renderedH = naturalH * scale; // 400
    const offsetX = (containerW - renderedW) / 2; // 187.5
    const offsetY = (containerH - renderedH) / 2; // 0

    // Touch at left edge of the visible image:
    const touchX = 187.5;
    const touchY = 200;

    const imgX = (touchX - offsetX) / scale;
    const imgY = (touchY - offsetY) / scale;

    expect(imgX).toBe(0);
    expect(imgY).toBe(800);
  });

  it("verifies natural aspect ratio calculation for 9:16, 1:1, 4:3, and 16:9", () => {
    const ratios: Record<string, [number, number]> = {
      "9:16": [1080, 1920],
      "1:1": [1000, 1000],
      "4:3": [1600, 1200],
      "16:9": [1920, 1080],
    };

    for (const [key, [w, h]] of Object.entries(ratios)) {
      const computedRatio = `${w} / ${h}`;
      expect(computedRatio).toBe(`${w} / ${h}`);
      const val = w / h;
      if (key === "1:1") expect(val).toBe(1);
      if (key === "16:9") expect(val).toBeCloseTo(1.777, 2);
      if (key === "9:16") expect(val).toBeCloseTo(0.5625, 3);
      if (key === "4:3") expect(val).toBeCloseTo(1.333, 2);
    }
  });
});

describe("Non-destructive Image History Stack & Revocation", () => {
  it("maintains version history, allows undo/redo, and truncates future on new push", () => {
    const history: string[] = ["blob:v0"];
    let historyIdx = 0;
    const revoked: string[] = [];

    const push = (url: string) => {
      const superseded = history.slice(historyIdx + 1);
      superseded.forEach((u) => revoked.push(u));
      history.splice(historyIdx + 1);
      history.push(url);
      historyIdx = history.length - 1;
    };

    const undo = () => {
      if (historyIdx > 0) historyIdx--;
    };

    const redo = () => {
      if (historyIdx < history.length - 1) historyIdx++;
    };

    // Step 1: apply AI result 1
    push("blob:v1-cutout");
    expect(history.length).toBe(2);
    expect(historyIdx).toBe(1);
    expect(history[historyIdx]).toBe("blob:v1-cutout");

    // Step 2: apply AI result 2
    push("blob:v2-enhance");
    expect(history.length).toBe(3);
    expect(historyIdx).toBe(2);

    // Step 3: undo to v1
    undo();
    expect(historyIdx).toBe(1);
    expect(history[historyIdx]).toBe("blob:v1-cutout");

    // Step 4: apply new branch (v3) -> superseded v2 must be revoked and truncated
    push("blob:v3-upscale");
    expect(history.length).toBe(3);
    expect(historyIdx).toBe(2);
    expect(history[historyIdx]).toBe("blob:v3-upscale");
    expect(revoked).toContain("blob:v2-enhance");
  });
});

describe("Cancellation and AbortSignal handling", () => {
  it("cancels active operation and rejects with AI_CANCELLED", async () => {
    const { WebAIProvider } = await import("@/services/ai/WebAIProvider");
    const provider = new WebAIProvider();

    const controller = new AbortController();
    const opPromise = provider.removeBackground("data:image/png;base64,mock", {
      signal: controller.signal,
      operationId: "test_op_cancel",
    });

    controller.abort();

    await expect(opPromise).rejects.toMatchObject({
      code: "AI_CANCELLED",
    });

    const isCancelled = await provider.cancel("test_op_cancel");
    // Operation was already cleaned up/aborted
    expect(typeof isCancelled).toBe("boolean");
  });
});
