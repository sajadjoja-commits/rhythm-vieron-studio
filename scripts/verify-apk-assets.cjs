const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_FINGERPRINT_PATH = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public', 'fingerprint.txt');
const SOURCE_BUILD_INFO_PATH = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public', 'build_info.json');

function log(msg) {
  console.log(`[VERIFY APK] ${msg}`);
}

function error(msg) {
  console.error(`\n=========================================`);
  console.error(`APK ASSET VERIFICATION FAILED: ${msg}`);
  console.error(`=========================================\n`);
  process.exit(1);
}

// 1. Locate APK
let apkPath = process.argv[2];

if (!apkPath) {
  // Search common debug APK output directories
  const searchDirs = [
    path.join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'debug'),
    path.join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'release')
  ];

  for (const sDir of searchDirs) {
    if (fs.existsSync(sDir)) {
      const apks = fs.readdirSync(sDir).filter(f => f.endsWith('.apk') && !f.includes('unaligned'));
      if (apks.length > 0) {
        // Pick the most recent
        apks.sort((a, b) => fs.statSync(path.join(sDir, b)).mtimeMs - fs.statSync(path.join(sDir, a)).mtimeMs);
        apkPath = path.join(sDir, apks[0]);
        break;
      }
    }
  }
}

if (!apkPath || !fs.existsSync(apkPath)) {
  error(`APK file not found. Checked: ${apkPath || 'standard output paths'}.\nPlease specify path: node scripts/verify-apk-assets.cjs <path-to-apk>`);
}

log(`Inspecting APK: ${apkPath}`);

// 2. Check unzip command
try {
  execSync('which unzip', { stdio: 'ignore' });
} catch {
  error('System command "unzip" is required for APK inspection.');
}

// 3. Inspect APK file listing
let apkFiles = [];
try {
  const listing = execSync(`unzip -Z -1 "${apkPath}"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  apkFiles = listing.split('\n').map(s => s.trim()).filter(Boolean);
} catch (e) {
  error(`Failed to read APK zip directory: ${e.message}`);
}

// Verification requirement 1: assets/public/index.html
const hasIndexHtml = apkFiles.includes('assets/public/index.html');
log(`assets/public/index.html present in APK: ${hasIndexHtml ? 'YES' : 'NO'}`);
if (!hasIndexHtml) {
  error('APK does NOT contain assets/public/index.html! Stale or empty packaging detected.');
}

// Verification requirement 2: assets/public/fingerprint.txt
const hasFingerprintTxt = apkFiles.includes('assets/public/fingerprint.txt');
log(`assets/public/fingerprint.txt present in APK: ${hasFingerprintTxt ? 'YES' : 'NO'}`);
if (!hasFingerprintTxt) {
  error('APK does NOT contain assets/public/fingerprint.txt!');
}

// Verification requirement 3: assets/public/build_info.json
const hasBuildInfoJson = apkFiles.includes('assets/public/build_info.json');
log(`assets/public/build_info.json present in APK: ${hasBuildInfoJson ? 'YES' : 'NO'}`);
if (!hasBuildInfoJson) {
  error('APK does NOT contain assets/public/build_info.json!');
}

// Extract and verify fingerprint.txt
let apkFingerprint = '';
try {
  apkFingerprint = execSync(`unzip -p "${apkPath}" assets/public/fingerprint.txt`).toString().trim();
} catch (e) {
  error(`Failed to extract assets/public/fingerprint.txt from APK: ${e.message}`);
}

// Extract and verify build_info.json
let apkBuildInfo = null;
try {
  const rawInfo = execSync(`unzip -p "${apkPath}" assets/public/build_info.json`).toString().trim();
  apkBuildInfo = JSON.parse(rawInfo);
} catch (e) {
  error(`Failed to extract or parse assets/public/build_info.json from APK: ${e.message}`);
}

log(`APK Fingerprint:    ${apkFingerprint}`);
log(`APK Web Build:      ${apkBuildInfo?.web}`);
log(`APK Packaging Mode: ${apkBuildInfo?.packaging}`);

// Compare with source assets
if (!fs.existsSync(SOURCE_FINGERPRINT_PATH)) {
  error(`Source fingerprint file missing at: ${SOURCE_FINGERPRINT_PATH}`);
}

const expectedFingerprint = fs.readFileSync(SOURCE_FINGERPRINT_PATH, 'utf8').trim();
log(`Source Fingerprint: ${expectedFingerprint}`);

if (apkFingerprint !== expectedFingerprint) {
  error(`FINGERPRINT MISMATCH!\nAPK contains:    ${apkFingerprint}\nSource requires: ${expectedFingerprint}\nThe APK was built with stale or outdated assets!`);
}

// Check JS assets presence
const jsAssets = apkFiles.filter(f => f.startsWith('assets/public/assets/') && f.endsWith('.js'));
log(`Total JS asset chunks in APK: ${jsAssets.length}`);
if (jsAssets.length === 0) {
  error('No compiled JS assets found inside APK assets/public/assets/!');
}

console.log('\n=========================================');
console.log('APK ASSET VERIFICATION: PASSED');
console.log('=========================================');
console.log(`APK:          ${apkPath}`);
console.log(`Web Build:    ${apkBuildInfo?.web}`);
console.log(`Fingerprint:  ${apkFingerprint}`);
console.log(`Packaging:    ${apkBuildInfo?.packaging}`);
console.log(`Assets Verified: ${jsAssets.length} JS chunks + index.html`);
console.log('Result: APK contains exact fresh build.');
console.log('=========================================\n');

process.exit(0);
