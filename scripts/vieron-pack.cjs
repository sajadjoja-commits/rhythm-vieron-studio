const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ANDROID_ASSETS_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public');
const SRC_BUILD_INFO_PATH = path.join(ROOT_DIR, 'src', 'build_info.json');
const ANDROID_DIR = path.join(ROOT_DIR, 'android');
const APK_OUTPUT_DIR = path.join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk');

function log(msg) {
  console.log(`[VIERON PACK] ${msg}`);
}

function error(msg) {
  console.error(`\n=========================================`);
  console.error(`VIERON PACKAGING ERROR: ${msg}`);
  console.error(`=========================================\n`);
  process.exit(1);
}

function getGitInfo() {
  try {
    const fullSha = execSync('git rev-parse HEAD', { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const shortSha = execSync('git rev-parse --short HEAD', { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return { full: fullSha, short: shortSha };
  } catch (e) {
    if (process.env.GITHUB_SHA) {
      const fullSha = process.env.GITHUB_SHA.trim();
      return { full: fullSha, short: fullSha.slice(0, 7) };
    }
    const fallback = crypto.createHash('sha256').update(Date.now().toString()).digest('hex');
    return { full: fallback, short: fallback.slice(0, 7) };
  }
}

function calculateDeterministicFingerprint(dir) {
  if (!fs.existsSync(dir)) return null;

  const files = getAllFiles(dir);
  const hash = crypto.createHash('sha256');
  let includedCount = 0;
  const inspectedFiles = [];

  files.sort((a, b) => {
    const relA = path.relative(dir, a).replace(/\\/g, '/');
    const relB = path.relative(dir, b).replace(/\\/g, '/');
    return relA.localeCompare(relB);
  });

  for (const file of files) {
    const relativePath = path.relative(dir, file).replace(/\\/g, '/');

    if (
      relativePath === 'build_info.json' ||
      relativePath === 'fingerprint.txt' ||
      relativePath === 'cordova.js' ||
      relativePath === 'cordova_plugins.js' ||
      relativePath.startsWith('plugins/') ||
      relativePath === 'capacitor.js' ||
      relativePath === 'electron-bridge.js' ||
      relativePath === '.DS_Store' ||
      relativePath.endsWith('.map')
    ) {
      continue;
    }

    const content = fs.readFileSync(file);
    hash.update(relativePath + '\0');
    hash.update(content);
    includedCount++;
    inspectedFiles.push({ path: relativePath, size: content.length });
  }

  return { hash: hash.digest('hex'), count: includedCount, files: inspectedFiles };
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  }
  return arrayOfFiles;
}

// ==========================================
// CANONICAL DETERMINISTIC PACKAGING PIPELINE
// ==========================================
log('Starting Canonical Deterministic Android Packaging...');

// STEP 1: Delete old dist/
log('Step 1: Deleting old dist/ directory...');
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}

// STEP 2: Delete old android/app/src/main/assets/public/
log('Step 2: Deleting old android/app/src/main/assets/public/ directory...');
if (fs.existsSync(ANDROID_ASSETS_DIR)) {
  fs.rmSync(ANDROID_ASSETS_DIR, { recursive: true, force: true });
}

// STEP 3: Delete old APK outputs (Requirement 14)
log('Step 3: Cleaning old APK outputs...');
if (fs.existsSync(APK_OUTPUT_DIR)) {
  fs.rmSync(APK_OUTPUT_DIR, { recursive: true, force: true });
}

// STEP 4: Build Identity & Metadata initialization
const gitInfo = getGitInfo();

let currentBuildNum = 1;
if (fs.existsSync(SRC_BUILD_INFO_PATH)) {
  try {
    const prev = JSON.parse(fs.readFileSync(SRC_BUILD_INFO_PATH, 'utf8'));
    if (prev && prev.build) {
      currentBuildNum = (parseInt(prev.build, 10) || 1) + 1;
    }
  } catch {}
}

const buildInfo = {
  native: "1.0.0",
  build: String(currentBuildNum),
  git: gitInfo.full,
  web: `web-${gitInfo.short}`,
  packaging: "APK_BUNDLED",
  ota: false,
  timestamp: new Date().toISOString(),
  fingerprint: "calculating..."
};

log(`Step 4: Build Identity initialized: Web=${buildInfo.web}, Build=${buildInfo.build}, Git=${gitInfo.short}`);
fs.writeFileSync(SRC_BUILD_INFO_PATH, JSON.stringify(buildInfo, null, 2));

// STEP 5: Fresh npm run build
log('Step 5: Compiling fresh Web bundle (npm run build)...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Fresh Web compilation failed.');
}

// STEP 6: Verify dist/index.html exists and is non-empty
log('Step 6: Verifying dist/index.html...');
const distIndexHtml = path.join(DIST_DIR, 'index.html');
if (!fs.existsSync(distIndexHtml) || fs.statSync(distIndexHtml).size === 0) {
  error('dist/index.html missing or empty after Web compilation.');
}

// STEP 7: Copy fresh Web bundle to Android assets
log('Step 7: Copying Web bundle to Android assets (npx cap copy android)...');
try {
  execSync('npx cap copy android', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Capacitor copy android failed.');
}

// STEP 8: Verify Android assets
log('Step 8: Verifying Android assets index.html...');
const androidIndexHtml = path.join(ANDROID_ASSETS_DIR, 'index.html');
if (!fs.existsSync(androidIndexHtml) || fs.statSync(androidIndexHtml).size === 0) {
  error('android/app/src/main/assets/public/index.html missing or empty.');
}

// STEP 9: Compute deterministic fingerprints of BOTH trees
log('Step 9: Calculating deterministic content fingerprints...');
const distFingerprint = calculateDeterministicFingerprint(DIST_DIR);
const androidFingerprint = calculateDeterministicFingerprint(ANDROID_ASSETS_DIR);

if (!distFingerprint || distFingerprint.count === 0) {
  error('dist/ fingerprint calculation failed or dist has 0 files.');
}
if (!androidFingerprint || androidFingerprint.count === 0) {
  error('Android assets fingerprint calculation failed or has 0 files.');
}

log(`dist/ fingerprint:           ${distFingerprint.hash} (${distFingerprint.count} files)`);
log(`android assets fingerprint:  ${androidFingerprint.hash} (${androidFingerprint.count} files)`);

// STEP 10: Require exact equality
log('Step 10: Verifying exact equality of Web and Android assets...');
if (distFingerprint.hash !== androidFingerprint.hash || distFingerprint.count !== androidFingerprint.count) {
  error(`Fingerprint mismatch!\nDist:    ${distFingerprint.hash} (${distFingerprint.count})\nAndroid: ${androidFingerprint.hash} (${androidFingerprint.count})`);
}

for (const item of distFingerprint.files) {
  const androidFile = path.join(ANDROID_ASSETS_DIR, item.path);
  if (!fs.existsSync(androidFile)) {
    error(`Missing file in android assets: ${item.path}`);
  }
  const distContent = fs.readFileSync(path.join(DIST_DIR, item.path));
  const androidContent = fs.readFileSync(androidFile);
  if (!distContent.equals(androidContent)) {
    error(`Byte content mismatch in ${item.path}`);
  }
}

// STEP 11: Finalize build metadata
log('Step 11: Finalizing deterministic metadata (build_info.json & fingerprint.txt)...');
buildInfo.fingerprint = distFingerprint.hash;
const finalBuildInfoJson = JSON.stringify(buildInfo, null, 2);

fs.writeFileSync(SRC_BUILD_INFO_PATH, finalBuildInfoJson);
fs.writeFileSync(path.join(DIST_DIR, 'build_info.json'), finalBuildInfoJson);
fs.writeFileSync(path.join(ANDROID_ASSETS_DIR, 'build_info.json'), finalBuildInfoJson);

fs.writeFileSync(path.join(DIST_DIR, 'fingerprint.txt'), distFingerprint.hash);
fs.writeFileSync(path.join(ANDROID_ASSETS_DIR, 'fingerprint.txt'), distFingerprint.hash);

// STEP 12: Check Java/Gradle availability for APK build
log('Step 12: Checking Java/Android SDK environment for APK build...');
let javaAvailable = false;
try {
  execSync('java -version', { stdio: 'ignore' });
  javaAvailable = true;
} catch {}

if (javaAvailable && fs.existsSync(path.join(ANDROID_DIR, 'gradlew'))) {
  log('Java detected. Running clean and assembleDebug...');
  try {
    execSync('./gradlew clean assembleDebug', { stdio: 'inherit', cwd: ANDROID_DIR });
    log('Running real APK asset verification...');
    execSync('node scripts/verify-apk-assets.cjs', { stdio: 'inherit', cwd: ROOT_DIR });
  } catch (e) {
    error(`APK build or verification failed: ${e.message}`);
  }
} else {
  log('Java/Android SDK is not installed in this environment.');
  log('APK REAL BUILD: BLOCKED — Java/Android SDK unavailable in this environment');
  log('Web assets are 100% packaged, verified, and synchronized in android/app/src/main/assets/public.');
  log('When opened in Android Studio or GitHub Actions CI (where JDK 17 is present), ./gradlew assembleDebug will produce the verified APK.');
}

console.log('\n=========================================');
console.log('VIERON CANONICAL PACKAGING COMPLETED');
console.log('=========================================');
console.log(`Web Build:           ${buildInfo.web}`);
console.log(`Build Number:        ${buildInfo.build}`);
console.log(`Version Code:        ${buildInfo.build}`);
console.log(`Git SHA:             ${buildInfo.git}`);
console.log(`Packaging:           ${buildInfo.packaging}`);
console.log(`OTA:                 ${buildInfo.ota ? 'ENABLED' : 'DISABLED'}`);
console.log(`Deterministic SHA:   ${buildInfo.fingerprint}`);
console.log(`Files Synchronized:  ${distFingerprint.count}`);
console.log('Dist and Android assets are 100% identical.');
console.log('=========================================\n');
