const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "android", "app", "src", "main", "assets", "public");
const LEGACY_WWW = path.join(ROOT, "android", "app", "src", "main", "assets", "www");
const ignored = new Set(["build_info.json", "fingerprint.txt"]);

function fail(message) {
  console.error(`[VERIFY NATIVE SHELL ERROR] ${message}`);
  process.exit(1);
}

function filesIn(directory, relativeTo = directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(full, relativeTo);
    const relative = path.relative(relativeTo, full).replace(/\\/g, "/");
    return ignored.has(relative) ? [] : [{ full, relative }];
  });
}

function computeFingerprint() {
  const hash = crypto.createHash("sha256");
  for (const file of filesIn(PUBLIC).sort((a, b) => a.relative.localeCompare(b.relative))) {
    hash.update(file.relative);
    hash.update(fs.readFileSync(file.full));
  }
  return hash.digest("hex");
}

if (!fs.existsSync(path.join(PUBLIC, "index.html"))) {
  fail("assets/public/index.html is missing. Run 'npm run build:android' first.");
}

if (fs.existsSync(LEGACY_WWW)) {
  fail("assets/www still exists and would reintroduce a second web bundle.");
}

const files = filesIn(PUBLIC);
if (!files.some((file) => file.relative.endsWith(".js"))) {
  fail("No JavaScript assets were found in assets/public.");
}

if (!files.some((file) => file.relative.endsWith(".css"))) {
  fail("No CSS assets were found in assets/public.");
}

const metadataPath = path.join(PUBLIC, "build_info.json");
if (!fs.existsSync(metadataPath)) {
  fail("build_info.json metadata is missing in assets/public.");
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const actualFingerprint = computeFingerprint();

if (metadata.assetDirectory !== "assets/public") {
  fail("build_info.json does not identify assets/public as assetDirectory.");
}

if (metadata.fingerprint !== actualFingerprint) {
  fail(`Fingerprint mismatch: build_info.json expected ${metadata.fingerprint}, actual assets fingerprint is ${actualFingerprint}.`);
}

console.log(`[VERIFY NATIVE SHELL SUCCESS] Valid native shell with ${files.length} assets. Fingerprint: ${actualFingerprint}`);
