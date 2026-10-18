const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "android", "app", "src", "main", "assets", "public");

function fail(message) {
  console.error(`[CAP SYNC ERROR] ${message}`);
  console.error("[CAP SYNC SAFETY] Existing assets and build outputs were preserved.");
  process.exit(1);
}

console.log("[CAP SYNC] Starting safe Capacitor sync for Android...");

if (!fs.existsSync(DIST) || !fs.existsSync(path.join(DIST, "index.html"))) {
  fail("dist/ folder not found or index.html missing. Run 'npm run build' first before syncing.");
}

if (!fs.existsSync(PUBLIC) || !fs.existsSync(path.join(PUBLIC, "index.html"))) {
  console.log("[CAP SYNC] android assets/public missing or empty. Syncing assets first...");
  const capCopyScript = path.join(__dirname, "cap-copy-android.cjs");
  const copyRes = spawnSync("node", [capCopyScript], { cwd: ROOT, stdio: "inherit" });
  if (copyRes.status !== 0) {
    fail("Failed to copy web assets before Capacitor sync.");
  }
}

console.log("[CAP SYNC] Executing Capacitor sync android...");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const syncResult = spawnSync(npx, ["cap", "sync", "android"], { cwd: ROOT, stdio: "inherit", shell: true });

if (syncResult.status !== 0) {
  fail("Capacitor sync command failed.");
}

console.log("[CAP SYNC SUCCESS] Capacitor android sync completed successfully without rebuilding APK.");
