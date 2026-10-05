const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const WWW_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'www');
const BUILD_INFO_PATH = path.join(WWW_DIR, 'build_info.json');

function log(msg) {
  console.log(`[VIERON NATIVE PACK] ${msg}`);
}

function error(msg) {
  console.error(`[VIERON NATIVE PACK ERROR] ${msg}`);
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

log('Starting deterministic Native Web Asset packaging...');

// 1. Run Vite build
log('Running Vite production build (npm run build)...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Vite build failed.');
}

const distIndex = path.join(DIST_DIR, 'index.html');
if (!fs.existsSync(distIndex)) {
  error('dist/index.html is missing after Vite build.');
}

// 2. Clean android/app/src/main/assets/www/
log('Cleaning android/app/src/main/assets/www/...');
cleanDir(WWW_DIR);

// 3. Copy dist into www/
log('Copying complete dist/ directory to android/app/src/main/assets/www/...');
copyRecursive(DIST_DIR, WWW_DIR);

const wwwIndex = path.join(WWW_DIR, 'index.html');
if (!fs.existsSync(wwwIndex)) {
  error('www/index.html is missing after copy.');
}

// 4 & 5. Count files & calculate fingerprint
const wwwFiles = getAllFiles(WWW_DIR);
if (wwwFiles.length === 0) {
  error('www/ asset directory is empty.');
}
const fingerprint = computeFingerprint(wwwFiles);
log(`Total files copied: ${wwwFiles.length}`);
log(`Asset SHA-256 Fingerprint: ${fingerprint}`);

// 6. Write build metadata file (build_info.json)
const gitSha = getGitSha();
const buildMetadata = {
  app: "Vieron Studio",
  nativePackage: "com.vireon.ai",
  webRuntime: "APK_ASSET_LOADER",
  git: gitSha,
  webBuild: Date.now().toString(),
  assetFingerprint: fingerprint,
  timestamp: new Date().toISOString()
};

fs.writeFileSync(BUILD_INFO_PATH, JSON.stringify(buildMetadata, null, 2));
log(`build_info.json written to ${BUILD_INFO_PATH}`);

log('SUCCESS: Native web packaging completed and verified.');
