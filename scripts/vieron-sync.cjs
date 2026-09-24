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
  console.error(`[VIERON SYNC ERROR] ${msg}`);
  process.exit(1);
}

function getGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT_DIR }).toString().trim();
  } catch (e) {
    return 'unknown';
  }
}

function getFingerprint(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = getAllFiles(dir).sort();
  const hash = crypto.createHash('sha256');
  let count = 0;
  for (const file of files) {
    const relativePath = path.relative(dir, file).replace(/\\/g, '/');

    // Ignore bridge and metadata files from fingerprinting to avoid circular dependency
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

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.lstatSync(fullPath).isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
        }
    }
  }
}

// 1. Verify working directory
if (!fs.existsSync(path.join(ROOT_DIR, 'package.json'))) {
  error('Must run from project root.');
}

const gitSha = getGitSha();
log(`Active Git SHA: ${gitSha}`);

// 2. Generate Initial Build Info (Web side needs to know its identity)
const buildInfo = {
  native: "1.0.0",
  build: "1",
  web: `web-${gitSha}`,
  git: gitSha,
  channel: "staging",
  timestamp: new Date().toISOString(),
  fingerprint: "calculating..."
};

fs.writeFileSync(BUILD_INFO_PATH, JSON.stringify(buildInfo, null, 2));
log('Generated src/build_info.json');

log('Starting Vieron Build & Sync...');

// 3. Build Web
try {
  log('Running npm run build...');
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Web build failed.');
}

if (!fs.existsSync(DIST_DIR)) {
  error('dist/ directory not found after build.');
}

// 4. Clean Android Assets
log('Cleaning Android assets...');
try {
    cleanDir(ANDROID_ASSETS_DIR);
} catch (e) {
    log('Warning: Could not fully clean assets directory.');
}

// 5. Sync Capacitor
try {
  log('Running npx cap sync android...');
  execSync('npx cap sync android', { stdio: 'inherit', cwd: ROOT_DIR });
} catch (e) {
  error('Capacitor sync failed.');
}

// 6. Verify and Compare
log('Verifying assets match...');
const distInfo = getFingerprint(DIST_DIR);
const androidInfo = getFingerprint(ANDROID_ASSETS_DIR);

log(`Dist: ${distInfo.count} files, Fingerprint: ${distInfo.hash}`);
log(`Android Assets: ${androidInfo.count} files, Fingerprint: ${androidInfo.hash}`);

if (distInfo.hash === androidInfo.hash && distInfo.count === androidInfo.count) {
  // Update the fingerprint in the source and built assets
  buildInfo.fingerprint = distInfo.hash;
  const finalBuildInfo = JSON.stringify(buildInfo, null, 2);

  // Write to source
  fs.writeFileSync(BUILD_INFO_PATH, finalBuildInfo);

  // Also write directly to built assets to avoid another build cycle
  fs.writeFileSync(path.join(DIST_DIR, 'build_info.json'), finalBuildInfo);
  fs.writeFileSync(path.join(ANDROID_ASSETS_DIR, 'build_info.json'), finalBuildInfo);

  // Persistent tracking file
  fs.writeFileSync(path.join(DIST_DIR, 'fingerprint.txt'), distInfo.hash);
  fs.writeFileSync(path.join(ANDROID_ASSETS_DIR, 'fingerprint.txt'), distInfo.hash);

  // Generate standardized Phase 6 OTA Manifests
  let totalDistSize = 0;
  for (const f of getAllFiles(DIST_DIR)) {
    totalDistSize += fs.statSync(f).size;
  }

  const otaManifestStaging = {
    channel: "staging",
    version: "1.0.0",
    build: 1,
    bundleUrl: `https://rhythm-vieron-studio.lovable.app/bundles/web-${gitSha}.zip`,
    checksum: distInfo.hash,
    size: totalDistSize,
    minNativeVersion: "1.0.0",
    maxNativeVersion: null,
    createdAt: new Date().toISOString(),
    releaseNotes: `Vieron Studio Staging Web Update (${gitSha})`
  };

  const otaManifestProd = {
    ...otaManifestStaging,
    channel: "production",
    releaseNotes: `Vieron Studio Production Web Update (${gitSha})`
  };

  fs.writeFileSync(path.join(DIST_DIR, 'ota-manifest.json'), JSON.stringify(otaManifestProd, null, 2));
  fs.writeFileSync(path.join(DIST_DIR, 'ota-manifest-staging.json'), JSON.stringify(otaManifestStaging, null, 2));
  fs.writeFileSync(path.join(ANDROID_ASSETS_DIR, 'ota-manifest.json'), JSON.stringify(otaManifestProd, null, 2));

  console.log('\n=========================================');
  console.log('VIERON SYNC SUCCESS');
  console.log(`Version: ${buildInfo.web}`);
  console.log(`SHA: ${buildInfo.git}`);
  console.log('Web build and Android assets are identical.');
  console.log('=========================================\n');
} else {
  error('VIERON SYNC FAILED: Android assets do not match dist after sync.');
}
