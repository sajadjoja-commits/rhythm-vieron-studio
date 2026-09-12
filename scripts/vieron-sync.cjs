const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ANDROID_ASSETS_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public');
const BUILD_INFO_PATH = path.join(ROOT_DIR, 'src', 'build_info.json');

function log(msg) {
  console.log(`[VIERON SYNC] ${msg}`);
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
    log(`Cleaning directory: ${dir}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

// 1. Verify environment
if (!fs.existsSync(path.join(ROOT_DIR, 'package.json'))) {
  error('Must run from project root.');
}

const gitSha = getGitSha();
log(`Active Git SHA: ${gitSha}`);

// 2. Prepare Build Info
const buildInfo = {
  native: "1.0.0",
  build: Date.now().toString(),
  web: `web-${gitSha}`,
  git: gitSha,
  timestamp: new Date().toISOString(),
  localOnly: true
};

fs.writeFileSync(BUILD_INFO_PATH, JSON.stringify(buildInfo, null, 2));

// 3. Clean and Build
log('Step 1: Cleaning dist...');
cleanDir(DIST_DIR);

log('Step 2: Building web project...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Web build failed.');
}

if (!fs.existsSync(DIST_DIR) || fs.readdirSync(DIST_DIR).length === 0) {
  error('dist/ is missing or empty after build.');
}

// 4. Clean Android Assets
log('Step 3: Cleaning Android assets...');
cleanDir(ANDROID_ASSETS_DIR);

// 5. Capacitor Sync
log('Step 4: Syncing with Capacitor...');
try {
  execSync('npx cap sync android', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Capacitor sync failed.');
}

// 6. Verification
log('Step 5: Running asset verification...');
try {
  execSync('node scripts/verify-web-assets.cjs', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Verification failed. Android assets do not match dist.');
}

log('\n=========================================');
log('VIERON SYNC COMPLETED SUCCESSFULLY');
log('App is now packaged for local-only execution.');
log('=========================================\n');
