import { describe, expect, it, vi } from "vitest";
import { directMotion, splitScript, analyzeTimelineEnergy } from "@/lib/motionDirector";
import { drawMotionLayer } from "@/lib/motionLayer";
import { MOTION_PRESETS } from "@/lib/motionGraphics";

describe("Local motion director", () => {
  it("maps Arabic love script to a heart without truncating script text", () => {
    const script = "أحب هذا الفيديو وكل تفاصيله الجميلة جداً!";
    const layers = directMotion({ script, duration: 4, style: "minimal" });
    expect(layers.find(o => o.motion?.preset === "typewriter")?.motion?.text).toBe(script);
    expect(layers.some(o => o.motion?.preset === "st-heart")).toBe(true);
  });
  it("keeps every layer within the uploaded video, including a very short video", () => {
    const layers = directMotion({ script: "أحب الفيديو. اشترك!", duration: 0.2 });
    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) { expect(layer.start).toBeGreaterThanOrEqual(0); expect(layer.end).toBeLessThanOrEqual(0.2); expect(layer.end).toBeGreaterThan(layer.start); }
  });
  it("has reproducible IDs and sentence timing", () => {
    const options = { script: "First. Second?", duration: 6, idPrefix: "test" };
    expect(directMotion(options)).toEqual(directMotion(options));
    expect(splitScript("أهلاً!\nكيف حالك؟")).toEqual(["أهلاً!", "كيف حالك؟"]);
  });
  it("cancels analysis instead of returning fabricated energy", async () => {
    const controller = new AbortController(); controller.abort();
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    await expect(analyzeTimelineEnergy([{ url: "blob:test", type: "video", in: 0, out: 4 }], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    canvas.mockRestore();
  });
  it("uses the same local-time preset drawing for preview and export resolutions", () => {
    const preset = MOTION_PRESETS.find(p => p.id === "pop-title");
    if (!preset) throw new Error("Missing preset");
    const draw = vi.spyOn(preset, "draw").mockImplementation(() => {});
    const ctx = { save: vi.fn(), restore: vi.fn(), scale: vi.fn() } as unknown as CanvasRenderingContext2D;
    const layer = directMotion({ script: "Hello", duration: 4, style: "minimal" })[0];
    layer.motion = { preset: "pop-title", text: "Hello" }; layer.start = 1; layer.end = 4;
    drawMotionLayer(ctx, layer, 2, 200, 80);
    drawMotionLayer(ctx, layer, 2, 1000, 400);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw.mock.calls[0].slice(1)).toEqual(draw.mock.calls[1].slice(1));
    expect(draw.mock.calls[0][2]).toBe(1);
    drawMotionLayer(ctx, layer, 4, 200, 80);
    expect(draw).toHaveBeenCalledTimes(2);
    draw.mockRestore();
  });
});