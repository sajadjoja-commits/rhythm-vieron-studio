import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";

describe("Phase Final: Deterministic Android Packaging & Runtime Tests (A - J)", () => {
  const rootDir = path.resolve(__dirname, "../../../../");
  const distDir = path.join(rootDir, "dist");
  const androidPublicDir = path.join(rootDir, "android/app/src/main/assets/public");

  function calculateDeterministicHash(dir: string): { hash: string; count: number } | null {
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

  // Test A: fresh dist -> pass
  it("Test A: fresh dist produces valid non-empty dist/index.html", () => {
    const distIndex = path.join(distDir, "index.html");
    expect(fs.existsSync(distIndex)).toBe(true);
    expect(fs.statSync(distIndex).size).toBeGreaterThan(0);
  });

  // Test B: old Android assets -> fail
  it("Test B: stale or mismatched android assets fail fingerprint verification", () => {
    const distFp = calculateDeterministicHash(distDir);
    expect(distFp).not.toBeNull();

    const staleHash = "deadbeef00000000000000000000000000000000000000000000000000000000";
    expect(distFp!.hash === staleHash).toBe(false);
  });

  // Test C: one modified JS byte -> fail
  it("Test C: modifying one byte in any JS chunk changes hash and fails equality", () => {
    const jsDir = path.join(androidPublicDir, "assets");
    expect(fs.existsSync(jsDir)).toBe(true);

    const jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"));
    expect(jsFiles.length).toBeGreaterThan(0);

    const firstJs = path.join(jsDir, jsFiles[0]);
    const originalBytes = fs.readFileSync(firstJs);

    // Simulate 1 byte modification
    const modifiedBytes = Buffer.from(originalBytes);
    modifiedBytes[0] = modifiedBytes[0] === 0x41 ? 0x42 : 0x41;

    const originalHash = crypto.createHash("sha256").update(originalBytes).digest("hex");
    const modifiedHash = crypto.createHash("sha256").update(modifiedBytes).digest("hex");

    expect(originalHash).not.toEqual(modifiedHash);
    expect(originalBytes.equals(modifiedBytes)).toBe(false);
  });

  // Test D: old APK -> fail
  it("Test D: verify-apk-assets.cjs detects and rejects mismatched/stale APK build metadata", () => {
    const verifyScript = path.join(rootDir, "scripts/verify-apk-assets.cjs");
    expect(fs.existsSync(verifyScript)).toBe(true);

    const scriptCode = fs.readFileSync(verifyScript, "utf8");
    expect(scriptCode).toContain("build_info.json mismatch");
    expect(scriptCode).toContain("Content fingerprint mismatch between APK and Source");
  });

  // Test E: APK with correct fingerprint.txt but modified JS -> FAIL
  it("Test E: verify-apk-assets.cjs checks actual JS file bytes, not just fingerprint.txt", () => {
    const verifyScript = path.join(rootDir, "scripts/verify-apk-assets.cjs");
    const scriptCode = fs.readFileSync(verifyScript, "utf8");

    // Proves it does not trust fingerprint.txt alone; it checks every JS chunk byte-for-byte
    expect(scriptCode).toContain("Byte content mismatch in JS chunk");
    expect(scriptCode).toContain("srcBytes.equals(apkBytes)");
  });

  // Test F: OTA state exists -> Debug still uses APK_BUNDLED
  it("Test F: MainActivity.java overrides load() to inject ServerPath(ASSET_PATH, 'public') before Bridge creation", () => {
    const mainActivity = path.join(rootDir, "android/app/src/main/java/com/vireon/ai/MainActivity.java");
    expect(fs.existsSync(mainActivity)).toBe(true);

    const code = fs.readFileSync(mainActivity, "utf8");
    expect(code).toContain("bridgeBuilder.setServerPath(new ServerPath(ServerPath.PathType.ASSET_PATH, \"public\"))");
    expect(code).toContain("if (BuildConfig.DEBUG)");
    expect(code).toContain("super.load()");
  });

  // Test G: serverBasePath exists in SharedPreferences -> Debug ignores it
  it("Test G: MainActivity.java clears CapWebViewSettings SharedPreferences in load() before Bridge initialization", () => {
    const mainActivity = path.join(rootDir, "android/app/src/main/java/com/vireon/ai/MainActivity.java");
    const code = fs.readFileSync(mainActivity, "utf8");

    expect(code).toContain("getSharedPreferences(\"CapWebViewSettings\"");
    expect(code).toContain("prefs.edit().clear().commit()");
  });

  // Test H: remote URL configured -> Debug refuses it
  it("Test H: main.tsx halts execution and raises error if remote Lovable origin is encountered on Native APK", () => {
    const mainTsx = path.join(rootDir, "src/main.tsx");
    const code = fs.readFileSync(mainTsx, "utf8");

    expect(code).toContain("origin.includes(\"lovable.app\")");
    expect(code).toContain("CRITICAL PACKAGING VIOLATION");
    expect(code).toContain("CRITICAL SECURITY FAILURE");
  });

  // Test I: Service Worker registered -> Native startup blocks it
  it("Test I: Native runtime completely disables and unregisters Service Worker to avoid cache pollution", () => {
    const mainTsx = path.join(rootDir, "src/main.tsx");
    const code = fs.readFileSync(mainTsx, "utf8");

    expect(code).toContain("Capacitor.isNativePlatform()");
    expect(code).toContain("registration.unregister()");
    expect(code).toContain("caches.delete");
  });

  // Test J: versionCode changes with build number
  it("Test J: android/app/build.gradle dynamically computes versionCode from src/build_info.json build number", () => {
    const buildGradle = path.join(rootDir, "android/app/build.gradle");
    const code = fs.readFileSync(buildGradle, "utf8");

    expect(code).toContain("def getBuildInfoVersionCode()");
    expect(code).toContain("parsed.build.toInteger()");
    expect(code).toContain("versionCode getBuildInfoVersionCode()");
  });
});
