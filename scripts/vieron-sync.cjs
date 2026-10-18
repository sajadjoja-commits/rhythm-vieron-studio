const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`[VIERON SYNC ERROR] ${message}`);
  console.error("[VIERON SYNC SAFETY] Sync pipeline stopped. Previous build outputs were preserved.");
  process.exit(1);
}

console.log("[VIERON SYNC] Starting safe Vieron sync pipeline...");

console.log("\n--- Step 1: Packaging Web Assets ---");
const packScript = path.join(__dirname, "vieron-pack.cjs");
const packRes = spawnSync("node", [packScript], { cwd: ROOT, stdio: "inherit" });
if (packRes.status !== 0) fail("Web packaging step failed.");

console.log("\n--- Step 2: Capacitor Sync ---");
const capSyncScript = path.join(__dirname, "cap-sync-android.cjs");
const syncRes = spawnSync("node", [capSyncScript], { cwd: ROOT, stdio: "inherit" });
if (syncRes.status !== 0) fail("Capacitor sync step failed.");

console.log("\n--- Step 3: Verifying Web Assets ---");
const verifyScript = path.join(__dirname, "verify-web-assets.cjs");
const verifyRes = spawnSync("node", [verifyScript], { cwd: ROOT, stdio: "inherit" });
if (verifyRes.status !== 0) fail("Web asset verification step failed.");

console.log("\n============================================================");
console.log("[VIERON SYNC SUCCESS] Packaging, sync, and asset verification completed successfully.");
console.log("============================================================");
