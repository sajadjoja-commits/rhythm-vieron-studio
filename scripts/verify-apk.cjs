const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const APK_PATH = path.join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'RhythmVieron-debug-1.0.3.apk');
const EXTRACT_DIR = path.join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'extracted_apk');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function log(msg) {
  console.log(`[VERIFY APK] ${msg}`);
}

function error(msg) {
  console.error(`[VERIFY APK ERROR] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(APK_PATH)) {
  error(`APK not found at ${APK_PATH}`);
}

log(`Found APK at: ${APK_PATH}`);

// Clean extraction dir
if (fs.existsSync(EXTRACT_DIR)) {
  fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(EXTRACT_DIR, { recursive: true });

log('Extracting APK contents...');
try {
  // Use PowerShell to extract zip/apk
  const psCmd = `Add-Type -A 'System.IO.Compression.FileSystem'; [System.IO.Compression.ZipFile]::ExtractToDirectory('${APK_PATH.replace(/\\/g, '/')}', '${EXTRACT_DIR.replace(/\\/g, '/')}')`;
  execSync(`powershell -Command "${psCmd}"`, { stdio: 'inherit' });
} catch (e) {
  error(`Failed to extract APK: ${e.message}`);
}

const apkAssetsPublic = path.join(EXTRACT_DIR, 'assets', 'public');
if (!fs.existsSync(apkAssetsPublic)) {
  error(`Extracted APK is missing assets/public at ${apkAssetsPublic}`);
}

log('APK assets/public found successfully.');

// Helper to get file hash
function getFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Compare files between dist/ and extracted APK assets/public
function verifyDir(distPath, apkPath, rel = '') {
  const entries = fs.readdirSync(distPath, { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    const distSub = path.join(distPath, name);
    const apkSub = path.join(apkPath, name);
    const relPath = path.join(rel, name).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (!fs.existsSync(apkSub)) {
        error(`Missing directory in APK: ${relPath}`);
      }
      verifyDir(distSub, apkSub, relPath);
    } else {
      if (!fs.existsSync(apkSub)) {
        error(`Missing file in APK: ${relPath}`);
      }
      const distHash = getFileHash(distSub);
      const apkHash = getFileHash(apkSub);
      if (distHash !== apkHash) {
        error(`Hash mismatch for ${relPath}:\n  dist: ${distHash}\n  APK : ${apkHash}`);
      }
    }
  }
}

log('Verifying byte-for-byte identity between dist/ and APK assets/public...');
verifyDir(DIST_DIR, apkAssetsPublic);

log('============================================================');
log('APK VERIFICATION SUCCESSFUL');
log('The generated APK contains exact deterministic local Web assets.');
log('Verified files: index.html, JS chunks, CSS, WASM, and build metadata.');
log('============================================================');
