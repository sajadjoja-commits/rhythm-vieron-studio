const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ANDROID_ASSETS_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public');

const IGNORED_METADATA = new Set([
  'capacitor.js',
  'cordova.js',
  'cordova_plugins.js',
  'build_info.json',
  'fingerprint.txt'
]);

function getGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT_DIR }).toString().trim();
  } catch (e) {
    return 'unknown';
  }
}

function getCategory(relPath) {
  const lower = relPath.toLowerCase();
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'JS';
  if (lower.endsWith('.css')) return 'CSS';
  if (/\.(png|jpe?g|gif|svg|webp|ico|avif)$/.test(lower)) return 'Images';
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(lower)) return 'Audio';
  if (lower.endsWith('.wasm')) return 'WASM';
  if (lower.endsWith('.webmanifest') || lower.endsWith('.manifest')) return 'Manifest';
  if (lower.endsWith('.html')) return 'HTML';
  return 'Other';
}

function log(msg) {
  console.log(msg);
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
  list.forEach(file => {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, relativeTo));
    } else {
      const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');
      if (!IGNORED_METADATA.has(relPath) && !relPath.startsWith('plugins/')) {
        results.push({
          relPath,
          fullPath,
          size: stat.size
        });
      }
    }
  });
  return results;
}

log('Vieron web assets verification started...');

if (!fs.existsSync(DIST_DIR)) {
  log('Error: dist/ not found.');
  process.exit(1);
}

const distFiles = getAllFiles(DIST_DIR);
const androidFiles = getAllFiles(ANDROID_ASSETS_DIR);

const distFingerprint = computeFingerprint(distFiles);
const androidFingerprint = computeFingerprint(androidFiles);

const gitSha = getGitSha();
const fingerprintContent = JSON.stringify({
  gitSha,
  timestamp: new Date().toISOString(),
  distFilesCount: distFiles.length,
  androidFilesCount: androidFiles.length,
  distFingerprint,
  androidFingerprint
}, null, 2);

fs.writeFileSync(path.join(DIST_DIR, 'fingerprint.txt'), fingerprintContent);
if (fs.existsSync(ANDROID_ASSETS_DIR)) {
  fs.writeFileSync(path.join(ANDROID_ASSETS_DIR, 'fingerprint.txt'), fingerprintContent);
}

const distMap = new Map(distFiles.map(f => [f.relPath, f]));
const androidMap = new Map(androidFiles.map(f => [f.relPath, f]));

let missing = 0;
let extra = 0;
let changed = [];

distMap.forEach((distFile, relPath) => {
  if (!androidMap.has(relPath)) {
    missing++;
    log(`Missing in Android: ${relPath}`);
  } else {
    const androidFile = androidMap.get(relPath);
    if (distFile.size !== androidFile.size || getFileHash(distFile.fullPath) !== getFileHash(androidFile.fullPath)) {
      changed.push(relPath);
    }
  }
});

androidMap.forEach((_, relPath) => {
  if (!distMap.has(relPath)) {
    extra++;
    log(`Extra in Android: ${relPath}`);
  }
});

log(`dist files: ${distFiles.length}`);
log(`android assets files: ${androidFiles.length}`);
log(`dist fingerprint: ${distFingerprint}`);
log(`android fingerprint: ${androidFingerprint}`);
log(`Missing files: ${missing}`);
log(`Extra files: ${extra}`);
log(`Changed files: ${changed.length}`);

const distCategories = {};
for (const f of distFiles) {
  const cat = getCategory(f.relPath);
  distCategories[cat] = (distCategories[cat] || 0) + 1;
}
log('');
log('File type breakdown (dist):');
for (const cat of ['JS', 'CSS', 'Images', 'Audio', 'WASM', 'Manifest', 'HTML', 'Other']) {
  log(`  ${cat}: ${distCategories[cat] || 0}`);
}

if (changed.length > 0) {
  log('\nChanged files:');
  changed.forEach(f => log(`- ${f}`));
}

if (missing === 0 && extra === 0 && changed.length === 0 && distFingerprint === androidFingerprint) {
  console.log('');
  console.log('=========================================');
  console.log('VIERON SYNC & VERIFICATION SUCCESS');
  console.log(`Dist files: ${distFiles.length}`);
  console.log(`Android assets files: ${androidFiles.length}`);
  console.log(`Fingerprint: ${distFingerprint}`);
  console.log('Missing files: 0');
  console.log('Extra files: 0');
  console.log('Changed files: 0');
  console.log('Web build and Android assets are 100% identical and deterministic.');
  console.log('=========================================');
  process.exit(0);
} else {
  log('Verification failed: fingerprint or file mismatch detected.');
  process.exit(1);
}
