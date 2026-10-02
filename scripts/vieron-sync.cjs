const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ANDROID_ASSETS_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public');
const BUILD_INFO_PATH = path.join(ROOT_DIR, 'src', 'build_info.json');
const ANDROID_APP_BUILD = path.join(ROOT_DIR, 'android', 'app', 'build');
const ANDROID_ROOT_BUILD = path.join(ROOT_DIR, 'android', 'build');
const ANDROID_APK_OUTPUTS = path.join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk');

function log(msg) {
  console.log(`\n[VIERON CANONICAL PIPELINE] ${msg}`);
}

function error(msg) {
  console.error(`\n[VIERON PIPELINE ERROR] ${msg}`);
  process.exit(1);
}

function getGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT_DIR }).toString().trim();
  } catch (e) {
    return 'unknown';
  }
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    log(`Deleting stale directory: ${dirPath}`);
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

// Step 1: Sanity check — must run from project root.
if (!fs.existsSync(path.join(ROOT_DIR, 'package.json'))) {
  error('Must run from project root.');
}
log('Project root confirmed.');

const gitSha = getGitSha();
log(`Active Git SHA: ${gitSha}`);

// Step 2: DELETE ALL STALE ASSETS AND BUILDS COMPLETELY
log('Step 1/7: Deleting all stale build outputs and assets completely...');
removeDir(DIST_DIR);
removeDir(ANDROID_ASSETS_DIR);
removeDir(ANDROID_APP_BUILD);
removeDir(ANDROID_ROOT_BUILD);
removeDir(ANDROID_APK_OUTPUTS);

// Step 3: Generate preliminary build metadata
const buildTimestamp = Date.now().toString();
const buildInfo = {
  native: '1.0.3',
  build: buildTimestamp,
  web: `web-${gitSha}`,
  git: gitSha,
  channel: 'production-local',
  packaging: 'APK_BUNDLED',
  ota: 'OFF',
  timestamp: new Date().toISOString(),
  localOnly: true,
  fingerprint: 'pending'
};
fs.writeFileSync(BUILD_INFO_PATH, JSON.stringify(buildInfo, null, 2));
log('Preliminary build info written.');

// Step 4: Build the web project (Vite build)
log('Step 2/7: Building web project (npm run build) ...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Web build failed. See output above.');
}

// Step 5: Confirm build output exists
log('Step 3/7: Verifying build output ...');
if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  error('dist/index.html is missing after build.');
}
if (fs.readdirSync(DIST_DIR).length === 0) {
  error('dist/ is empty after build.');
}
log('Build verified (dist/index.html present).');

// Step 6: Compute final asset fingerprint from generated dist/
log('Step 4/7: Computing exact asset fingerprint from dist/ ...');
function getAllFiles(dirPath, relativeTo = dirPath) {
  let results = [];
  if (!fs.existsSync(dirPath)) return results;
  const list = fs.readdirSync(dirPath);
  list.forEach(file => {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, relativeTo));
    } else {
      const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');
      if (relPath !== 'build_info.json' && relPath !== 'fingerprint.txt' && !relPath.startsWith('plugins/')) {
        results.push({ relPath, fullPath, size: stat.size });
      }
    }
  });
  return results;
}

const distFiles = getAllFiles(DIST_DIR);
const hash = crypto.createHash('sha256');
for (const file of [...distFiles].sort((a, b) => a.relPath.localeCompare(b.relPath))) {
  hash.update(file.relPath);
  hash.update(fs.readFileSync(file.fullPath));
}
const exactFingerprint = hash.digest('hex');
log(`Computed exact Web asset fingerprint: ${exactFingerprint}`);

// Update build_info.json with exact fingerprint and write to dist/ and src/
buildInfo.fingerprint = exactFingerprint;
const finalBuildInfoStr = JSON.stringify(buildInfo, null, 2);
fs.writeFileSync(BUILD_INFO_PATH, finalBuildInfoStr);
fs.writeFileSync(path.join(DIST_DIR, 'build_info.json'), finalBuildInfoStr);

// Also write fingerprint.txt to dist/
fs.writeFileSync(path.join(DIST_DIR, 'fingerprint.txt'), JSON.stringify({
  gitSha,
  timestamp: buildInfo.timestamp,
  filesCount: distFiles.length,
  fingerprint: exactFingerprint
}, null, 2));

// Step 7: Copy fresh dist/ byte-for-byte into Android assets
log('Step 5/7: Copying fresh dist/ byte-for-byte into Android assets ...');
fs.mkdirSync(ANDROID_ASSETS_DIR, { recursive: true });

try {
  execSync('npx cap sync android', { stdio: 'inherit', cwd: ROOT_DIR, env: { ...process.env, CAP_SYNC_EXIT_ON_ERROR: '1' } });
} catch (e) {
  error('Capacitor sync failed. See output above.');
}

// Re-write build_info.json and fingerprint.txt directly into android assets to be 100% certain
fs.writeFileSync(path.join(ANDROID_ASSETS_DIR, 'build_info.json'), finalBuildInfoStr);
fs.writeFileSync(path.join(ANDROID_ASSETS_DIR, 'fingerprint.txt'), fs.readFileSync(path.join(DIST_DIR, 'fingerprint.txt')));

// Step 8: Verify Android assets match dist byte-for-byte
log('Step 6/7: Verifying Android assets match dist 100% ...');
try {
  execSync('node scripts/verify-web-assets.cjs', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Verification failed: Android assets do not match dist.');
}

log('Step 7/7: Web sync and verification pipeline completed successfully.');
console.log('\n============================================================');
console.log('VIERON CANONICAL WEB SYNC & VERIFICATION COMPLETED');
console.log(`Git SHA: ${gitSha}`);
console.log(`Web Build ID: web-${gitSha}`);
console.log(`Fingerprint: ${exactFingerprint}`);
console.log('Packaging Mode: APK_BUNDLED (Local-only, offline execution)');
console.log('OTA: OFF (Disabled in debug)');
console.log('============================================================\n');
