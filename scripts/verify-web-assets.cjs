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
  console.error(`VIERON ASSET PROTECTION FAILED`);
  console.error(`=========================================`);
  console.error(msg);
  console.error(`\nThe Android assets are stale or do not match the current web build.`);
  console.error(`Run: npm run vieron:sync`);
  console.error(`=========================================\n`);
  process.exit(1);
}

function getFingerprint(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = getAllFiles(dir).sort();
  const hash = crypto.createHash('sha256');
  let count = 0;
  for (const file of files) {
    const relativePath = path.relative(dir, file).replace(/\\/g, '/');

    // Sync logic exclusion list must match exactly with vieron-sync.cjs
    if (relativePath === 'cordova.js' ||
        relativePath === 'cordova_plugins.js' ||
        relativePath.startsWith('plugins/') ||
        relativePath === 'capacitor.js' ||
        relativePath === 'electron-bridge.js' ||
        relativePath === 'build_info.json' ||
        relativePath === 'fingerprint.txt') {
        continue;
    }

    const content = fs.readFileSync(file);
    hash.update(relativePath);
    hash.update(content);
    count++;
  }
  return { hash: hash.digest('hex'), count };
}

function getAllFiles(dirPath, arrayOfFiles) {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

log('Starting asset verification gate...');

if (!fs.existsSync(DIST_DIR)) {
  error('Web build directory (dist/) not found. Please run npm run build.');
}

if (!fs.existsSync(ANDROID_ASSETS_DIR)) {
  error('Android assets directory not found. Please run npx cap sync android.');
}

const distInfo = getFingerprint(DIST_DIR);
const androidInfo = getFingerprint(ANDROID_ASSETS_DIR);

if (!distInfo || distInfo.count === 0) {
  error('dist/ is empty or missing.');
}

if (!androidInfo || androidInfo.count === 0) {
  error('Android assets are empty or missing.');
}

log(`Web Fingerprint: ${distInfo.hash} (${distInfo.count} files)`);
log(`Android Fingerprint: ${androidInfo.hash} (${androidInfo.count} files)`);

if (distInfo.hash === androidInfo.hash && distInfo.count === androidInfo.count) {
  log('VERIFY PASS: Web build and Android assets match.');
  process.exit(0);
} else {
  error(`MISMATCH DETECTED\nWeb: ${distInfo.hash}\nAndroid: ${androidInfo.hash}`);
}
