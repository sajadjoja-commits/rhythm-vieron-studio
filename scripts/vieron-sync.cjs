const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ANDROID_ASSETS_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public');
const BUILD_INFO_PATH = path.join(ROOT_DIR, 'src', 'build_info.json');

function log(msg) {
  console.log(`\n[VIERON SYNC] ${msg}`);
}

function error(msg) {
  console.error(`\n[VIERON SYNC ERROR] ${msg}`);
  process.exit(1);
}

function getGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT_DIR }).toString().trim();
  } catch (e) {
    return 'unknown';
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

// Step 1: Sanity check — must run from project root.
if (!fs.existsSync(path.join(ROOT_DIR, 'package.json'))) {
  error('Must run from project root.');
}
log('Project root confirmed.');

const gitSha = getGitSha();
log(`Active Git SHA: ${gitSha}`);

// Step 2: Clean the previous build.
log('Step 2/8: Cleaning dist ...');
cleanDir(DIST_DIR);

// Step 3: Build the web project.
log('Step 3/8: Building web project (npm run build) ...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Web build failed. See output above.');
}

// Step 4: Confirm the build output exists and is not empty.
log('Step 4/8: Verifying build output ...');
if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  error('dist/index.html is missing after build.');
}
if (fs.readdirSync(DIST_DIR).length === 0) {
  error('dist/ is empty after build.');
}
log('Build verified (dist/index.html present).');

// Read generated fingerprint.txt if verify-web-assets created it or compute it
let fingerprint = 'unknown';
const fingerprintPath = path.join(DIST_DIR, 'fingerprint.txt');
if (fs.existsSync(fingerprintPath)) {
  try {
    const fpData = JSON.parse(fs.readFileSync(fingerprintPath, 'utf8'));
    fingerprint = fpData.distFingerprint || 'unknown';
  } catch {}
}

const buildInfo = {
  native: '1.0.3',
  build: Date.now().toString(),
  web: `web-${gitSha}`,
  git: gitSha,
  channel: 'production-local',
  timestamp: new Date().toISOString(),
  localOnly: true,
  fingerprint
};
fs.writeFileSync(BUILD_INFO_PATH, JSON.stringify(buildInfo, null, 2));
log('Build info written with fingerprint: ' + fingerprint);

// Step 5: Clean Android assets so no stale files survive.
log('Step 5/8: Cleaning Android assets ...');
cleanDir(ANDROID_ASSETS_DIR);

// Step 6: Capacitor sync. Capacitor copies the entire webDir (dist)
// into the Android assets dir after removing the destination, so no
// partial or stale files can remain. Any copy failure fails the script.
log('Step 6/8: Running npx cap sync android ...');
try {
  execSync('npx cap sync android', { stdio: 'inherit', cwd: ROOT_DIR, env: { ...process.env, CAP_SYNC_EXIT_ON_ERROR: '1' } });
} catch (e) {
  error('Capacitor sync failed. See output above.');
}

// Step 7: Verify Android assets match dist (missing/extra/changed).
// Shows fingerprint and file counts. Exits non-zero on any difference,
// which aborts the whole script.
log('Step 7/8: Verifying Android assets match dist ...');
try {
  execSync('node scripts/verify-web-assets.cjs', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Verification failed: Android assets do not match dist.');
}

// Step 8: Report.
log('Step 8/8: Sync complete.');
console.log('\n============================================================');
console.log('VIERON SYNC COMPLETED SUCCESSFULLY');
console.log('App is packaged for LOCAL-ONLY execution.');
console.log('Runs offline from embedded web assets, no external services.');
console.log('Web assets copied to: ' + ANDROID_ASSETS_DIR);
console.log('Next: cd android && gradlew.bat assembleDebug');
console.log('============================================================\n');