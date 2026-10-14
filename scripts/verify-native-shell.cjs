const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "android", "app", "src", "main", "assets", "public");
const LEGACY_WWW = path.join(ROOT, "android", "app", "src", "main", "assets", "www");
const ignored = new Set(["build_info.json", "fingerprint.txt"]);
function fail(message) { console.error(`[VERIFY NATIVE SHELL] ${message}`); process.exit(1); }
function filesIn(directory, relativeTo = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(full, relativeTo);
    const relative = path.relative(relativeTo, full).replace(/\\/g, "/");
    return ignored.has(relative) ? [] : [{ full, relative }];
  });
}
function fingerprint() {
  const hash = crypto.createHash("sha256");
  for (const file of filesIn(PUBLIC).sort((a, b) => a.relative.localeCompare(b.relative))) {
    hash.update(file.relative); hash.update(fs.readFileSync(file.full));
  }
  return hash.digest("hex");
}
if (!fs.existsSync(path.join(PUBLIC, "index.html"))) fail("assets/public/index.html is missing.");
if (fs.existsSync(LEGACY_WWW)) fail("assets/www still exists and would reintroduce a second web bundle.");
const files = filesIn(PUBLIC);
if (!files.some((file) => file.relative.endsWith(".js"))) fail("No JavaScript asset was packaged.");
if (!files.some((file) => file.relative.endsWith(".css"))) fail("No CSS asset was packaged.");
const metadataPath = path.join(PUBLIC, "build_info.json");
if (!fs.existsSync(metadataPath)) fail("build_info.json is missing.");
const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const actual = fingerprint();
if (metadata.assetDirectory !== "assets/public") fail("Metadata does not identify assets/public as the web bundle.");
if (metadata.fingerprint !== actual) fail(`Fingerprint mismatch: expected ${metadata.fingerprint}, got ${actual}.`);
console.log(`[VERIFY NATIVE SHELL] OK: ${files.length} files, fingerprint ${actual}`);
