const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ANDROID_ASSETS_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public');

function log(msg) {
  console.log(`[VIERON ASSET VERIFY] ${msg}`);
}

function error(msg) {
  console.error(`\n=========================================`);
  console.error(`VIERON ASSET VERIFICATION FAILED: ${msg}`);
  console.error(`=========================================`);
  console.error(`Android web assets are stale or do not match dist.`);
  console.error(`Run canonical command: npm run build:android`);
  console.error(`=========================================\n`);
  process.exit(1);
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

log('Starting strict asset verification gate...');

if (!fs.existsSync(DIST_DIR) || !fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  error('Web build directory (dist/index.html) not found. Run: npm run build:android');
}

if (!fs.existsSync(ANDROID_ASSETS_DIR) || !fs.existsSync(path.join(ANDROID_ASSETS_DIR, 'index.html'))) {
  error('Android assets (android/app/src/main/assets/public/index.html) not found. Run: npm run build:android');
}

const distFingerprintFile = path.join(DIST_DIR, 'fingerprint.txt');
const androidFingerprintFile = path.join(ANDROID_ASSETS_DIR, 'fingerprint.txt');
if (!fs.existsSync(distFingerprintFile) || !fs.existsSync(androidFingerprintFile)) {
  error('Missing fingerprint.txt in dist or android assets. Run: npm run build:android');
}

const distBuildInfoFile = path.join(DIST_DIR, 'build_info.json');
const androidBuildInfoFile = path.join(ANDROID_ASSETS_DIR, 'build_info.json');
if (!fs.existsSync(distBuildInfoFile) || !fs.existsSync(androidBuildInfoFile)) {
  error('Missing build_info.json in dist or android assets. Run: npm run build:android');
}

const distInfo = calculateDeterministicFingerprint(DIST_DIR);
const androidInfo = calculateDeterministicFingerprint(ANDROID_ASSETS_DIR);

if (!distInfo || distInfo.count === 0) {
  error('dist/ is empty or failed fingerprint calculation.');
}
if (!androidInfo || androidInfo.count === 0) {
  error('Android assets are empty or failed fingerprint calculation.');
}

log(`dist/ fingerprint:           ${distInfo.hash} (${distInfo.count} files)`);
log(`android assets fingerprint:  ${androidInfo.hash} (${androidInfo.count} files)`);

if (distInfo.hash !== androidInfo.hash || distInfo.count !== androidInfo.count) {
  error(`MISMATCH DETECTED\nWeb:     ${distInfo.hash} (${distInfo.count})\nAndroid: ${androidInfo.hash} (${androidInfo.count})`);
}

// Verify stored fingerprints match computed fingerprints
const distStored = fs.readFileSync(distFingerprintFile, 'utf8').trim();
const androidStored = fs.readFileSync(androidFingerprintFile, 'utf8').trim();
if (distStored !== distInfo.hash || androidStored !== androidInfo.hash) {
  error(`Stored fingerprint.txt does not match calculated hash!\nStored:     ${distStored}\nCalculated: ${distInfo.hash}`);
}

log('VERIFY PASS: Web build and Android assets match deterministically.');
process.exit(0);
