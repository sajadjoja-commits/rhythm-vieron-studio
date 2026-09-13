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

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    error(`Source directory missing: ${src}`);
  }
  fs.cpSync(src, dest, { recursive: true, force: true });
}

// Sanity check: must run from project root.
if (!fs.existsSync(path.join(ROOT_DIR, 'package.json'))) {
  error('Must run from project root.');
}

const gitSha = getGitSha();
log(`Active Git SHA: ${gitSha}`);

// Prepare build info that is bundled into the app.
const buildInfo = {
  native: '1.0.3',
  build: Date.now().toString(),
  web: `web-${gitSha}`,
  git: gitSha,
  timestamp: new Date().toISOString(),
  localOnly: true
};
fs.writeFileSync(BUILD_INFO_PATH, JSON.stringify(buildInfo, null, 2));
log('Build info written.');

// Step 1: Clean dist
log('Step 1/8: Cleaning dist ...');
cleanDir(DIST_DIR);

// Step 2: Build the web project
log('Step 2/8: Building web project (npm run build) ...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Web build failed. See output above.');
}

// Step 3: Confirm build succeeded
log('Step 3/8: Verifying build output ...');
if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  error('dist/index.html is missing after build.');
}
if (fs.readdirSync(DIST_DIR).length === 0) {
  error('dist/ is empty after build.');
}
log('Build verified (dist/index.html present).');

// Step 4: Clean Android assets
log('Step 4/8: Cleaning Android assets ...');
cleanDir(ANDROID_ASSETS_DIR);

// Step 5: Copy build into Android assets
log('Step 5/8: Copying build to Android assets ...');
copyDir(DIST_DIR, ANDROID_ASSETS_DIR);

// Step 6: Capacitor sync (copy + update native plugins)
log('Step 6/8: Running npx cap sync android ...');
try {
  execSync('npx cap sync android', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Capacitor sync failed. See output above.');
}

// Step 7: Verify dist matches Android assets
log('Step 7/8: Verifying Android assets match dist ...');
try {
  execSync('node scripts/verify-web-assets.cjs', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Verification failed: Android assets do not match dist.');
}

// Step 8: Report
log('Step 8/8: Sync complete.');
console.log('\n============================================================');
console.log('VIERON SYNC COMPLETED SUCCESSFULLY');
console.log('App is packaged for LOCAL-ONLY execution.');
console.log('No external URL, no Capgo, no OTA.');
console.log('Web assets copied to: ' + ANDROID_ASSETS_DIR);
console.log('Next: cd android && gradlew.bat assembleDebug');
console.log('============================================================\n');