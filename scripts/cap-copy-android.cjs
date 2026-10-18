const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = process.env.DIST_OVERRIDE || path.join(ROOT, "dist");
const ASSETS_DIR = process.env.ASSETS_OVERRIDE || path.join(ROOT, "android", "app", "src", "main", "assets");
const PUBLIC = path.join(ASSETS_DIR, "public");
const STAGING = path.join(ASSETS_DIR, ".public_staging");
const BACKUP = path.join(ASSETS_DIR, ".public_backup");

function cleanDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function fail(message) {
  console.error(`[CAP COPY ERROR] ${message}`);
  cleanDir(STAGING);
  if (fs.existsSync(BACKUP) && !fs.existsSync(PUBLIC)) {
    try {
      fs.renameSync(BACKUP, PUBLIC);
      console.log("[CAP COPY RECOVERY] Restored assets/public from backup.");
    } catch (err) {
      console.error(`[CAP COPY CRITICAL] Restore failed: ${err.message}`);
    }
  }
  console.error("[CAP COPY SAFETY] Existing assets in android/app/src/main/assets/public/ were preserved.");
  process.exit(1);
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

console.log("[CAP COPY] Starting safe web assets copy to Android...");

if (!fs.existsSync(DIST) || !fs.existsSync(path.join(DIST, "index.html"))) {
  fail("dist/ folder not found or index.html is missing. Run 'npm run build' first.");
}

console.log("[CAP COPY] Staging web assets copy...");
cleanDir(STAGING);
cleanDir(BACKUP);
copyDirectory(DIST, STAGING);

if (!fs.existsSync(path.join(STAGING, "index.html"))) {
  fail("Staging copy failed: index.html missing in staging.");
}

console.log("[CAP COPY] Updating assets/public safely...");
try {
  if (fs.existsSync(PUBLIC)) {
    fs.renameSync(PUBLIC, BACKUP);
  }
  fs.renameSync(STAGING, PUBLIC);
  cleanDir(BACKUP);
} catch (swapErr) {
  fail(`Failed to update assets/public: ${swapErr.message}`);
}

console.log("[CAP COPY] Executing Capacitor copy android...");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const capResult = spawnSync(npx, ["cap", "copy", "android"], { cwd: ROOT, stdio: "inherit", shell: true });

if (capResult.status !== 0) {
  fail("Capacitor copy command failed.");
}

console.log("[CAP COPY SUCCESS] Web assets copied to Android successfully without running a full packaging cycle.");
