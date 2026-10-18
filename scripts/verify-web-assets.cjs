const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ANDROID_ASSETS_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public');

// Narrow exceptions for metadata and Capacitor dynamic runtime files
const NARROW_EXCEPTIONS = new Set([
  'capacitor.js',
  'cordova.js',
  'cordova_plugins.js',
  'build_info.json',
  'fingerprint.txt'
]);

function log(msg) {
  console.log(`[VERIFY WEB ASSETS] ${msg}`);
}

function error(msg) {
  console.error(`[VERIFY WEB ASSETS ERROR] ${msg}`);
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

function getCategory(relPath) {
  const lower = relPath.toLowerCase();
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'JS Chunks';
  if (lower.endsWith('.css')) return 'CSS Styles';
  if (/\.(png|jpe?g|gif|svg|webp|ico|avif)$/.test(lower)) return 'Images/Icons';
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(lower)) return 'Audio Assets';
  if (lower.endsWith('.wasm')) return 'WASM Modules';
  if (lower.endsWith('.webmanifest') || lower.endsWith('.manifest')) return 'Manifest';
  if (lower.endsWith('.html')) return 'HTML';
  return 'Other';
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

log('Starting byte-for-byte web assets verification...');

if (!fs.existsSync(DIST_DIR)) {
  error('[VERIFY INCOMPLETE] dist/ directory does not exist. Run "npm run build" first.');
  process.exit(1);
}

if (!fs.existsSync(ANDROID_ASSETS_DIR)) {
  error('[VERIFY INCOMPLETE] android/app/src/main/assets/public directory does not exist. Run "npm run build:android" first.');
  process.exit(1);
}

const distFiles = getAllFiles(DIST_DIR);
const androidFiles = getAllFiles(ANDROID_ASSETS_DIR);

if (distFiles.length === 0) {
  error('[VERIFY INCOMPLETE] dist/ is empty.');
  process.exit(1);
}

if (androidFiles.length === 0) {
  error('[VERIFY INCOMPLETE] android/app/src/main/assets/public is empty.');
  process.exit(1);
}

// Verify critical files presence
const hasDistIndex = distFiles.some(f => f.relPath === 'index.html');
const hasAndroidIndex = androidFiles.some(f => f.relPath === 'index.html');
const distJsCount = distFiles.filter(f => f.relPath.endsWith('.js')).length;
const androidJsCount = androidFiles.filter(f => f.relPath.endsWith('.js')).length;

if (!hasDistIndex || !hasAndroidIndex) {
  error('index.html is missing in dist/ or assets/public/.');
  process.exit(1);
}

if (distJsCount === 0 || androidJsCount === 0) {
  error('No JavaScript chunks found in dist/ or assets/public/. Presence of index.html alone is NOT sufficient.');
  process.exit(1);
}

const distFingerprint = computeFingerprint(distFiles);
const androidFingerprint = computeFingerprint(androidFiles);

const distMap = new Map(distFiles.map(f => [f.relPath, f]));
const androidMap = new Map(androidFiles.map(f => [f.relPath, f]));

let missing = 0;
let extra = 0;
let changed = [];

distMap.forEach((distFile, relPath) => {
  if (!androidMap.has(relPath)) {
    missing++;
    error(`Missing in Android assets: ${relPath}`);
  } else {
    const androidFile = androidMap.get(relPath);
    if (distFile.size !== androidFile.size || getFileHash(distFile.fullPath) !== getFileHash(androidFile.fullPath)) {
      changed.push(relPath);
      error(`Content mismatch for ${relPath}`);
    }
  }
});

androidMap.forEach((_, relPath) => {
  if (!distMap.has(relPath)) {
    extra++;
    error(`Extra file in Android assets: ${relPath}`);
  }
});

log(`Dist files count: ${distFiles.length}`);
log(`Android assets count: ${androidFiles.length}`);
log(`Dist content SHA256 fingerprint: ${distFingerprint}`);
log(`Android content SHA256 fingerprint: ${androidFingerprint}`);

const distCategories = {};
for (const f of distFiles) {
  const cat = getCategory(f.relPath);
  distCategories[cat] = (distCategories[cat] || 0) + 1;
}

log('\nAsset type breakdown (dist):');
for (const cat of ['HTML', 'JS Chunks', 'CSS Styles', 'Images/Icons', 'Audio Assets', 'WASM Modules', 'Manifest', 'Other']) {
  if (distCategories[cat]) {
    log(`  - ${cat}: ${distCategories[cat]}`);
  }
}

if (missing === 0 && extra === 0 && changed.length === 0 && distFingerprint === androidFingerprint) {
  console.log('\n============================================================');
  console.log('[VERIFY SUCCESS] dist/ and android assets/public are 100% byte-identical.');
  console.log(`Verified files: ${distFiles.length} files (including index.html, ${distJsCount} JS chunks, CSS, and media).`);
  console.log(`SHA256 Fingerprint: ${distFingerprint}`);
  console.log('============================================================');
  process.exit(0);
} else {
  error(`Verification failed! Missing: ${missing}, Extra: ${extra}, Changed: ${changed.length}`);
  process.exit(1);
}
