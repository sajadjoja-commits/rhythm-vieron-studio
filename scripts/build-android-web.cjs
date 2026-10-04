const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const WWW_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'www');
const BUILD_INFO_PATH = path.join(WWW_DIR, 'build_info.json');

function log(msg) {
  console.log(`\n[NATIVE SHELL BUILD] ${msg}`);
}

function error(msg) {
  console.error(`\n[NATIVE SHELL ERROR] ${msg}`);
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

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(child => {
      copyRecursive(path.join(src, child), path.join(dest, child));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
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
      if (relPath !== 'build_info.json') {
        results.push({ relPath, fullPath, size: stat.size });
      }
    }
  });
  return results;
}

function computeFingerprint(files) {
  const hash = crypto.createHash('sha256');
  for (const file of [...files].sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    hash.update(file.relPath);
    hash.update(fs.readFileSync(file.fullPath));
  }
  return hash.digest('hex');
}

log('Starting Native Shell web packaging ...');

// Step 1: Build web project
log('Step 1/5: Running Vite build (npm run build) ...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Vite build failed.');
}

if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  error('dist/index.html is missing after build.');
}
log('Vite build verified.');

// Step 2: Clean and recreate android/app/src/main/assets/www/
log('Step 2/5: Cleaning android/app/src/main/assets/www/ ...');
cleanDir(WWW_DIR);

// Step 3: Copy dist to www/
log('Step 3/5: Copying dist/ to android/app/src/main/assets/www/ ...');
copyRecursive(DIST_DIR, WWW_DIR);

if (!fs.existsSync(path.join(WWW_DIR, 'index.html'))) {
  error('www/index.html is missing after copying.');
}
log('Web assets copied successfully.');

// Step 4: Compute fingerprint and verify assets
log('Step 4/5: Calculating fingerprint and verifying assets ...');
const wwwFiles = getAllFiles(WWW_DIR);
const fingerprint = computeFingerprint(wwwFiles);

log(`Total packaged files: ${wwwFiles.length}`);
log(`Asset fingerprint: ${fingerprint}`);

// Step 5: Write build_info.json
log('Step 5/5: Writing build_info.json ...');
const gitSha = getGitSha();
const buildInfo = {
  runtime: 'APK_ASSET_LOADER',
  packaging: 'NATIVE_ANDROID_SHELL',
  git: gitSha,
  build: Date.now().toString(),
  web: `web-${gitSha}`,
  fingerprint: fingerprint,
  timestamp: new Date().toISOString()
};

fs.writeFileSync(BUILD_INFO_PATH, JSON.stringify(buildInfo, null, 2));
log('build_info.json written to www/build_info.json');

console.log('\n============================================================');
console.log('NATIVE SHELL WEB PACKAGING COMPLETED SUCCESSFULLY');
console.log(`Target URL: https://appassets.androidplatform.net/assets/www/index.html`);
console.log(`Fingerprint: ${fingerprint}`);
console.log('============================================================\n');
