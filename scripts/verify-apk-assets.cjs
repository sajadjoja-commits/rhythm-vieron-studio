const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const APK_BASE_DIR = process.env.APK_DIR_OVERRIDE || path.join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk');
const EXTRACT_DIR = path.join(APK_BASE_DIR, '.extracted_apk_temp');
const DIST_DIR = process.env.DIST_DIR_OVERRIDE || path.join(ROOT_DIR, 'dist');
const ANDROID_ASSETS_DIR = process.env.ASSETS_DIR_OVERRIDE || path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public');

const NARROW_EXCEPTIONS = new Set([
  'capacitor.js',
  'cordova.js',
  'cordova_plugins.js',
  'build_info.json',
  'fingerprint.txt'
]);

function log(msg) {
  console.log(`[VERIFY APK ASSETS] ${msg}`);
}

function error(msg) {
  console.error(`[VERIFY APK ASSETS ERROR] ${msg}`);
}

function findApkFiles(dir) {
  let apks = [];
  if (!fs.existsSync(dir)) return apks;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      apks = apks.concat(findApkFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.apk')) {
      apks.push(full);
    }
  }
  return apks;
}

function cleanDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function getFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function computeFingerprint(files) {
  const hash = crypto.createHash('sha256');
  for (const file of [...files].sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    hash.update(file.relPath);
    hash.update(fs.readFileSync(file.fullPath));
  }
  return hash.digest('hex');
}

function getAllFiles(dirPath, relativeTo = dirPath) {
  let results = [];
  if (!fs.existsSync(dirPath)) return results;

  const list = fs.readdirSync(dirPath);
  for (const file of list) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, relativeTo));
    } else {
      const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');
      if (!NARROW_EXCEPTIONS.has(relPath) && !relPath.startsWith('plugins/')) {
        results.push({
          relPath,
          fullPath,
          size: stat.size
        });
      }
    }
  }
  return results;
}

log('Starting APK actual asset content verification...');

if (!fs.existsSync(DIST_DIR)) {
  error('[VERIFY INCOMPLETE] dist/ directory not found. Build web assets first with "npm run build".');
  process.exit(1);
}

const apks = findApkFiles(APK_BASE_DIR);
if (apks.length === 0) {
  error('[VERIFY INCOMPLETE] No APK file found in android/app/build/outputs/apk/. Cannot perform APK verification until an APK is built.');
  process.exit(1);
}

const apkPath = apks[0];
log(`Found target APK file at: ${apkPath}`);

cleanDir(EXTRACT_DIR);
fs.mkdirSync(EXTRACT_DIR, { recursive: true });

log('Extracting APK content for actual asset inspection...');
try {
  if (process.platform === 'win32') {
    const psCmd = `Add-Type -A 'System.IO.Compression.FileSystem'; [System.IO.Compression.ZipFile]::ExtractToDirectory('${apkPath.replace(/\\/g, '/')}', '${EXTRACT_DIR.replace(/\\/g, '/')}')`;
    execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'pipe' });
  } else {
    execSync(`unzip -q "${apkPath}" -d "${EXTRACT_DIR}"`, { stdio: 'pipe' });
  }
} catch (e) {
  cleanDir(EXTRACT_DIR);
  error(`Failed to extract APK contents: ${e.message}`);
  process.exit(1);
}

const apkAssetsPublic = path.join(EXTRACT_DIR, 'assets', 'public');
if (!fs.existsSync(apkAssetsPublic)) {
  cleanDir(EXTRACT_DIR);
  error(`APK does not contain assets/public folder at ${apkAssetsPublic}.`);
  process.exit(1);
}

const sourceFiles = getAllFiles(DIST_DIR);
const apkFiles = getAllFiles(apkAssetsPublic);

if (sourceFiles.length === 0 || apkFiles.length === 0) {
  cleanDir(EXTRACT_DIR);
  error('Extracted APK assets or source dist/ is empty.');
  process.exit(1);
}

const sourceJsCount = sourceFiles.filter(f => f.relPath.endsWith('.js')).length;
const apkJsCount = apkFiles.filter(f => f.relPath.endsWith('.js')).length;

if (apkJsCount === 0) {
  cleanDir(EXTRACT_DIR);
  error('APK assets/public contains NO JavaScript chunks. Presence of index.html alone is NOT sufficient.');
  process.exit(1);
}

const sourceFingerprint = computeFingerprint(sourceFiles);
const apkFingerprint = computeFingerprint(apkFiles);

const sourceMap = new Map(sourceFiles.map(f => [f.relPath, f]));
const apkMap = new Map(apkFiles.map(f => [f.relPath, f]));

let missing = 0;
let extra = 0;
let changed = [];

sourceMap.forEach((distFile, relPath) => {
  if (!apkMap.has(relPath)) {
    missing++;
    error(`Missing file in APK assets: ${relPath}`);
  } else {
    const apkFile = apkMap.get(relPath);
    if (distFile.size !== apkFile.size || getFileHash(distFile.fullPath) !== getFileHash(apkFile.fullPath)) {
      changed.push(relPath);
      error(`Hash mismatch for ${relPath}`);
    }
  }
});

apkMap.forEach((_, relPath) => {
  if (!sourceMap.has(relPath)) {
    extra++;
    error(`Extra file in APK assets: ${relPath}`);
  }
});

cleanDir(EXTRACT_DIR);

log(`Source dist files count: ${sourceFiles.length}`);
log(`APK assets files count: ${apkFiles.length}`);
log(`Source content fingerprint: ${sourceFingerprint}`);
log(`APK assets fingerprint: ${apkFingerprint}`);

if (missing === 0 && extra === 0 && changed.length === 0 && sourceFingerprint === apkFingerprint) {
  console.log('\n============================================================');
  console.log('[VERIFY APK SUCCESS] APK assets match dist/ 100% byte-for-byte.');
  console.log(`Verified ${apkFiles.length} assets inside APK (including ${apkJsCount} JS chunks and all resources).`);
  console.log(`APK Assets Fingerprint: ${apkFingerprint}`);
  console.log('============================================================');
  process.exit(0);
} else {
  error(`APK Asset Verification Failed! Missing: ${missing}, Extra: ${extra}, Mismatched: ${changed.length}`);
  process.exit(1);
}
