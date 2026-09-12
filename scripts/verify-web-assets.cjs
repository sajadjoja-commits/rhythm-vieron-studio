const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ANDROID_ASSETS_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public');

function log(msg) {
  console.log(msg);
}

function getFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
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
      // Ignore Capacitor/Cordova generated files
      if (!['capacitor.js', 'cordova.js', 'cordova_plugins.js', 'fingerprint.txt'].includes(relPath) && !relPath.startsWith('plugins/')) {
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
log(`Missing files: ${missing}`);
log(`Extra files: ${extra}`);
log(`Changed files: ${changed.length}`);

if (changed.length > 0) {
  log('\nChanged files:');
  changed.forEach(f => log(`- ${f}`));
}

if (missing === 0 && extra === 0 && changed.length === 0) {
  log('Verification successful.');
  process.exit(0);
} else {
  log('Verification failed.');
  process.exit(1);
}
