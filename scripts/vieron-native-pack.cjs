const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync, execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "android", "app", "src", "main", "assets", "public");
const LEGACY_WWW = path.join(ROOT, "android", "app", "src", "main", "assets", "www");
const SOURCE_BUILD_INFO = path.join(ROOT, "src", "build_info.json");
const METADATA = new Set(["build_info.json", "fingerprint.txt"]);

function fail(message) { console.error(`[VIERON PACKAGE] ${message}`); process.exit(1); }
function gitSha() {
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); }
  catch { return "unknown"; }
}
function copyDirectory(source, destination) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) { fs.mkdirSync(to, { recursive: true }); copyDirectory(from, to); }
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}
function filesIn(directory, relativeTo = directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesIn(full, relativeTo));
    else if (entry.isFile()) {
      const relative = path.relative(relativeTo, full).replace(/\\/g, "/");
      if (!METADATA.has(relative)) files.push({ full, relative });
    }
  }
  return files;
}
function fingerprint(directory) {
  const hash = crypto.createHash("sha256");
  for (const file of filesIn(directory).sort((a, b) => a.relative.localeCompare(b.relative))) {
    hash.update(file.relative);
    hash.update(fs.readFileSync(file.full));
  }
  return hash.digest("hex");
}

const build = {
  schema: 1, app: "Vieron Studio", nativePackage: "com.vireon.ai",
  runtime: "APK_ASSET_LOADER", source: "APK_BUNDLED", assetDirectory: "assets/public",
  git: gitSha(), buildId: `${Date.now()}`, timestamp: new Date().toISOString(),
};
fs.writeFileSync(SOURCE_BUILD_INFO, JSON.stringify({ ...build, fingerprint: "pending" }, null, 2) + "\n");

console.log("[VIERON PACKAGE] Building the web app...");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["run", "build"], { cwd: ROOT, stdio: "inherit", shell: true });
if (result.status !== 0) fail("Web build failed.");
if (!fs.existsSync(path.join(DIST, "index.html"))) fail("dist/index.html was not generated.");

console.log("[VIERON PACKAGE] Replacing Android assets/public with this build...");
fs.rmSync(PUBLIC, { recursive: true, force: true });
fs.mkdirSync(PUBLIC, { recursive: true });
copyDirectory(DIST, PUBLIC);
fs.rmSync(LEGACY_WWW, { recursive: true, force: true });

const assetFingerprint = fingerprint(PUBLIC);
const metadata = { ...build, fingerprint: assetFingerprint, files: filesIn(PUBLIC).length };
fs.writeFileSync(path.join(PUBLIC, "build_info.json"), JSON.stringify(metadata, null, 2) + "\n");
fs.writeFileSync(path.join(PUBLIC, "fingerprint.txt"), `${assetFingerprint}\n`);
console.log(`[VIERON PACKAGE] Packaged ${metadata.files} web files into assets/public.`);
console.log(`[VIERON PACKAGE] Fingerprint: ${assetFingerprint}`);
