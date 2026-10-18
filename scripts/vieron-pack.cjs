const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync, execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const ASSETS_DIR = path.join(ROOT, "android", "app", "src", "main", "assets");
const PUBLIC = path.join(ASSETS_DIR, "public");
const STAGING = path.join(ASSETS_DIR, ".public_staging");
const BACKUP = path.join(ASSETS_DIR, ".public_backup");
const LEGACY_WWW = path.join(ASSETS_DIR, "www");
const SOURCE_BUILD_INFO = path.join(ROOT, "src", "build_info.json");
const METADATA = new Set(["build_info.json", "fingerprint.txt"]);

function cleanDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function fail(message) {
  console.error(`[VIERON PACK ERROR] ${message}`);
  cleanDir(STAGING);
  if (fs.existsSync(BACKUP) && !fs.existsSync(PUBLIC)) {
    try {
      fs.renameSync(BACKUP, PUBLIC);
      console.log("[VIERON PACK RECOVERY] Restored previous assets/public from backup.");
    } catch (err) {
      console.error(`[VIERON PACK CRITICAL] Failed to restore backup: ${err.message}`);
    }
  }
  console.error("[VIERON PACK SAFETY] Previous valid assets in android/app/src/main/assets/public/ were preserved.");
  process.exit(1);
}

function gitSha() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function filesIn(directory, relativeTo = directory) {
  const files = [];
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...filesIn(full, relativeTo));
    } else if (entry.isFile()) {
      const relative = path.relative(relativeTo, full).replace(/\\/g, "/");
      if (!METADATA.has(relative)) {
        files.push({ full, relative });
      }
    }
  }
  return files;
}

function computeFingerprint(directory) {
  const hash = crypto.createHash("sha256");
  const filesList = filesIn(directory).sort((a, b) => a.relative.localeCompare(b.relative));
  for (const file of filesList) {
    hash.update(file.relative);
    hash.update(fs.readFileSync(file.full));
  }
  return hash.digest("hex");
}

console.log("[VIERON PACK] Starting safe web build and packaging...");

const buildMetadata = {
  schema: 1,
  app: "Vieron Studio",
  nativePackage: "com.vireon.ai",
  runtime: "APK_ASSET_LOADER",
  source: "APK_BUNDLED",
  assetDirectory: "assets/public",
  git: gitSha(),
  buildId: `${Date.now()}`,
  timestamp: new Date().toISOString(),
};

fs.writeFileSync(SOURCE_BUILD_INFO, JSON.stringify({ ...buildMetadata, fingerprint: "pending" }, null, 2) + "\n");

console.log("[VIERON PACK] Building web bundle with Vite...");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const buildResult = spawnSync(npm, ["run", "build"], { cwd: ROOT, stdio: "inherit", shell: true });

if (buildResult.status !== 0) {
  fail("Web build failed (npm run build returned non-zero status).");
}

const indexPath = path.join(DIST, "index.html");
if (!fs.existsSync(indexPath) || fs.statSync(indexPath).size === 0) {
  fail("dist/index.html was not generated or is empty.");
}

const distFiles = filesIn(DIST);
const hasJs = distFiles.some(f => f.relative.endsWith(".js"));
const hasCss = distFiles.some(f => f.relative.endsWith(".css"));

if (!hasJs || !hasCss) {
  fail("dist/ is missing required JavaScript or CSS assets.");
}

console.log(`[VIERON PACK] Verified dist/ build (${distFiles.length} files, JS and CSS present).`);

console.log("[VIERON PACK] Preparing staging directory in android/app/src/main/assets/.public_staging...");
cleanDir(STAGING);
cleanDir(BACKUP);
copyDirectory(DIST, STAGING);
cleanDir(LEGACY_WWW);

const assetFingerprint = computeFingerprint(STAGING);
const stagedFiles = filesIn(STAGING);

if (stagedFiles.length !== distFiles.length) {
  fail(`Staged file count (${stagedFiles.length}) does not match dist file count (${distFiles.length}).`);
}

const metadataPayload = {
  ...buildMetadata,
  fingerprint: assetFingerprint,
  files: stagedFiles.length
};

fs.writeFileSync(path.join(STAGING, "build_info.json"), JSON.stringify(metadataPayload, null, 2) + "\n");
fs.writeFileSync(path.join(STAGING, "fingerprint.txt"), `${assetFingerprint}\n`);
fs.writeFileSync(SOURCE_BUILD_INFO, JSON.stringify(metadataPayload, null, 2) + "\n");

console.log(`[VIERON PACK] Staging asset verification successful. Fingerprint: ${assetFingerprint}`);

console.log("[VIERON PACK] Atomically swapping staging directory into assets/public...");
try {
  if (fs.existsSync(PUBLIC)) {
    fs.renameSync(PUBLIC, BACKUP);
  }
  fs.renameSync(STAGING, PUBLIC);
  cleanDir(BACKUP);
} catch (swapErr) {
  fail(`Failed to update assets/public directory: ${swapErr.message}`);
}

console.log("============================================================");
console.log("[VIERON PACK SUCCESS] Android web assets packaged safely.");
console.log(`[VIERON PACK SUCCESS] Total packaged assets: ${stagedFiles.length}`);
console.log(`[VIERON PACK SUCCESS] Asset fingerprint: ${assetFingerprint}`);
console.log("============================================================");
