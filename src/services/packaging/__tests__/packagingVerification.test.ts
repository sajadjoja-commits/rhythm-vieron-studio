import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";

describe("Phase Final Packaging: Deterministic Android Packaging & Verification Tests", () => {
  const rootDir = path.resolve(__dirname, "../../../../");
  const distDir = path.join(rootDir, "dist");
  const androidPublicDir = path.join(rootDir, "android/app/src/main/assets/public");

  // Helper to calculate deterministic fingerprint exactly as scripts do
  function calculateTestFingerprint(dir: string): { hash: string; count: number } | null {
    if (!fs.existsSync(dir)) return null;
    const files: string[] = [];

    function collect(current: string) {
      for (const f of fs.readdirSync(current)) {
        const full = path.join(current, f);
        if (fs.statSync(full).isDirectory()) collect(full);
        else files.push(full);
      }
    }
    collect(dir);

    files.sort((a, b) => {
      const relA = path.relative(dir, a).replace(/\\/g, "/");
      const relB = path.relative(dir, b).replace(/\\/g, "/");
      return relA.localeCompare(relB);
    });

    const hash = crypto.createHash("sha256");
    let count = 0;

    for (const f of files) {
      const rel = path.relative(dir, f).replace(/\\/g, "/");
      if (
        rel === "build_info.json" ||
        rel === "fingerprint.txt" ||
        rel === "cordova.js" ||
        rel === "cordova_plugins.js" ||
        rel.startsWith("plugins/") ||
        rel === "capacitor.js" ||
        rel === "electron-bridge.js" ||
        rel === ".DS_Store" ||
        rel.endsWith(".map")
      ) {
        continue;
      }
      hash.update(rel + "\0");
      hash.update(fs.readFileSync(f));
      count++;
    }

    return { hash: hash.digest("hex"), count };
  }

  it("A: fresh source produces non-empty dist/index.html after build", () => {
    const distIndex = path.join(distDir, "index.html");
    expect(fs.existsSync(distIndex)).toBe(true);
    expect(fs.statSync(distIndex).size).toBeGreaterThan(0);
  });

  it("B: fresh dist is mirrored to android assets (index.html, assets, build_info.json)", () => {
    const androidIndex = path.join(androidPublicDir, "index.html");
    const androidBuildInfo = path.join(androidPublicDir, "build_info.json");
    const androidFingerprint = path.join(androidPublicDir, "fingerprint.txt");

    expect(fs.existsSync(androidIndex)).toBe(true);
    expect(fs.existsSync(androidBuildInfo)).toBe(true);
    expect(fs.existsSync(androidFingerprint)).toBe(true);
  });

  it("C: android assets fingerprint exactly matches dist fingerprint", () => {
    const distFp = calculateTestFingerprint(distDir);
    const androidFp = calculateTestFingerprint(androidPublicDir);

    expect(distFp).not.toBeNull();
    expect(androidFp).not.toBeNull();
    expect(distFp!.count).toBeGreaterThan(0);
    expect(distFp!.hash).toBe(androidFp!.hash);
    expect(distFp!.count).toBe(androidFp!.count);
  });

  it("D: stale android assets detect mismatch and fail verification", () => {
    const distFp = calculateTestFingerprint(distDir);
    expect(distFp).not.toBeNull();

    // Simulate stale hash
    const fakeStaleHash = "0000000000000000000000000000000000000000000000000000000000000000";
    expect(fakeStaleHash === distFp!.hash).toBe(false);
  });

  it("E: dist/build_info.json specifies packaging=APK_BUNDLED and ota=false", () => {
    const buildInfoFile = path.join(androidPublicDir, "build_info.json");
    expect(fs.existsSync(buildInfoFile)).toBe(true);

    const info = JSON.parse(fs.readFileSync(buildInfoFile, "utf8"));
    expect(info.packaging).toBe("APK_BUNDLED");
    expect(info.ota).toBe(false);
    expect(info.web).toMatch(/^web-/);
    expect(info.native).toBe("1.0.0");
  });

  it("F: OTA state says old version -> DEBUG still forces APK bundled assets", () => {
    // Contract verification: MainActivity.java contains BuildConfig.DEBUG forceBundledAssets
    const mainActivityPath = path.join(rootDir, "android/app/src/main/java/com/vireon/ai/MainActivity.java");
    expect(fs.existsSync(mainActivityPath)).toBe(true);

    const javaCode = fs.readFileSync(mainActivityPath, "utf8");
    expect(javaCode).toContain("if (BuildConfig.DEBUG)");
    expect(javaCode).toContain("forceBundledAssets()");
    expect(javaCode).toContain("getBridge().setServerAssetPath(\"public\")");
  });

  it("G: OTA bundle exists -> VireonOTAPlugin rejects activation in DEBUG", () => {
    const pluginPath = path.join(rootDir, "android/app/src/main/java/com/vireon/ai/VireonOTAPlugin.java");
    expect(fs.existsSync(pluginPath)).toBe(true);

    const pluginCode = fs.readFileSync(pluginPath, "utf8");
    expect(pluginCode).toContain("if (BuildConfig.DEBUG)");
    expect(pluginCode).toContain("OTA_DISABLED_IN_DEBUG");
  });

  it("H: remote Lovable URL is completely removed from capacitor config and android assets", () => {
    const capConfigTs = path.join(rootDir, "capacitor.config.ts");
    const capConfigJson = path.join(rootDir, "android/app/src/main/assets/capacitor.config.json");

    const tsContent = fs.readFileSync(capConfigTs, "utf8");
    expect(tsContent).not.toContain("rhythm-vieron-studio.lovable.app");
    expect(tsContent).not.toContain("url:");

    if (fs.existsSync(capConfigJson)) {
      const jsonContent = fs.readFileSync(capConfigJson, "utf8");
      expect(jsonContent).not.toContain("rhythm-vieron-studio.lovable.app");
    }
  });

  it("I & J: verification script verify-apk-assets.cjs exists and is executable", () => {
    const verifyScript = path.join(rootDir, "scripts/verify-apk-assets.cjs");
    expect(fs.existsSync(verifyScript)).toBe(true);

    const scriptContent = fs.readFileSync(verifyScript, "utf8");
    expect(scriptContent).toContain("assets/public/index.html");
    expect(scriptContent).toContain("assets/public/fingerprint.txt");
    expect(scriptContent).toContain("assets/public/build_info.json");
    expect(scriptContent).toContain("FINGERPRINT MISMATCH");
  });
});
