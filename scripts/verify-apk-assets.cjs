const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const OUTPUT_APK_DIR = path.join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'debug');

function log(msg) {
  console.log(`[VERIFY APK] ${msg}`);
}

function error(msg) {
  console.error(`\n=========================================`);
  console.error(`APK ASSET VERIFICATION FAILED: ${msg}`);
  console.error(`=========================================\n`);
  process.exit(1);
}

// 1. Locate APK deterministically
let apkPath = process.argv[2];

if (!apkPath) {
  if (!fs.existsSync(OUTPUT_APK_DIR)) {
    // Check if Java is available in environment
    try {
      execSync('java -version', { stdio: 'ignore' });
      error(`APK output directory not found: ${OUTPUT_APK_DIR}. Build APK first with: ./gradlew assembleDebug`);
    } catch {
      console.log('APK REAL BUILD: BLOCKED — Java/Android SDK unavailable in this environment');
      error('Java/Android SDK is not installed in this environment to build or verify a native APK file.');
    }
  }

  const apkFiles = fs.readdirSync(OUTPUT_APK_DIR).filter(f => f.endsWith('.apk') && !f.includes('unaligned'));
  if (apkFiles.length === 0) {
    error(`No APK files found in ${OUTPUT_APK_DIR}. Run: cd android && ./gradlew assembleDebug`);
  }

  if (apkFiles.length > 1) {
    error(`Multiple APKs found in ${OUTPUT_APK_DIR} (${apkFiles.join(', ')}). Refusing to pick blindly. Clean old outputs with: ./gradlew clean`);
  }

  apkPath = path.join(OUTPUT_APK_DIR, apkFiles[0]);
}

if (!fs.existsSync(apkPath)) {
  error(`APK file does not exist at: ${apkPath}`);
}

log(`Inspecting APK: ${apkPath}`);

// 2. Ensure unzip utility is present
try {
  execSync('which unzip', { stdio: 'ignore' });
} catch {
  error('System command "unzip" is required for deep APK inspection.');
}

// 3. Extract assets/public/* into a clean temp directory
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vieron-apk-verify-'));
log(`Extracting APK assets to temporary sandbox: ${tempDir}`);

try {
  execSync(`unzip -q "${apkPath}" "assets/public/*" -d "${tempDir}"`, { stdio: 'pipe' });
} catch (e) {
  fs.rmSync(tempDir, { recursive: true, force: true });
  error(`Failed to extract assets/public/ from APK. The APK might not contain web assets: ${e.message}`);
}

const extractedPublicDir = path.join(tempDir, 'assets', 'public');
if (!fs.existsSync(extractedPublicDir)) {
  fs.rmSync(tempDir, { recursive: true, force: true });
  error('APK does NOT contain assets/public/ directory! Invalid or empty packaging.');
}

// Helper: Calculate deterministic fingerprint over extracted files
function calculateDeterministicFingerprint(dir) {
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
    inspectedFiles.push({ path: relativePath, size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') });
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

try {
  // 4. CHECK INDEX.HTML BYTES (Requirement 11)
  const apkIndexHtmlPath = path.join(extractedPublicDir, 'index.html');
  const sourceIndexHtmlPath = path.join(SOURCE_DIR, 'index.html');

  if (!fs.existsSync(apkIndexHtmlPath)) {
    throw new Error('APK missing assets/public/index.html');
  }
  if (!fs.existsSync(sourceIndexHtmlPath)) {
    throw new Error('Source missing android/app/src/main/assets/public/index.html');
  }

  const apkIndexBytes = fs.readFileSync(apkIndexHtmlPath);
  const sourceIndexBytes = fs.readFileSync(sourceIndexHtmlPath);

  if (!apkIndexBytes.equals(sourceIndexBytes)) {
    throw new Error(`Byte mismatch in index.html! APK size=${apkIndexBytes.length}, Source size=${sourceIndexBytes.length}`);
  }
  log(`assets/public/index.html: 100% BYTE-FOR-BYTE MATCH (${apkIndexBytes.length} bytes)`);

  // 5. CHECK BUILD_INFO.JSON (Requirement 12)
  const apkBuildInfoPath = path.join(extractedPublicDir, 'build_info.json');
  const sourceBuildInfoPath = path.join(SOURCE_DIR, 'build_info.json');

  if (!fs.existsSync(apkBuildInfoPath)) {
    throw new Error('APK missing assets/public/build_info.json');
  }

  const apkBuildInfo = JSON.parse(fs.readFileSync(apkBuildInfoPath, 'utf8'));
  const sourceBuildInfo = JSON.parse(fs.readFileSync(sourceBuildInfoPath, 'utf8'));

  const fieldsToCheck = ['web', 'git', 'build', 'packaging', 'ota', 'fingerprint'];
  for (const field of fieldsToCheck) {
    if (apkBuildInfo[field] !== sourceBuildInfo[field]) {
      throw new Error(`build_info.json mismatch on '${field}': APK=${apkBuildInfo[field]} vs Source=${sourceBuildInfo[field]}`);
    }
  }
  log(`assets/public/build_info.json: 100% METADATA MATCH (web=${apkBuildInfo.web}, build=${apkBuildInfo.build})`);

  // 6. CHECK ALL JS CHUNKS FILE-BY-FILE (Requirement 10)
  const sourceAssetsDir = path.join(SOURCE_DIR, 'assets');
  const apkAssetsDir = path.join(extractedPublicDir, 'assets');

  if (fs.existsSync(sourceAssetsDir)) {
    const sourceJsFiles = fs.readdirSync(sourceAssetsDir).filter(f => f.endsWith('.js'));
    log(`Verifying ${sourceJsFiles.length} JavaScript asset chunks byte-for-byte...`);

    for (const jsFile of sourceJsFiles) {
      const apkJsPath = path.join(apkAssetsDir, jsFile);
      const srcJsPath = path.join(sourceAssetsDir, jsFile);

      if (!fs.existsSync(apkJsPath)) {
        throw new Error(`Missing JS chunk in APK: assets/${jsFile}`);
      }

      const srcBytes = fs.readFileSync(srcJsPath);
      const apkBytes = fs.readFileSync(apkJsPath);

      if (!srcBytes.equals(apkBytes)) {
        throw new Error(`Byte content mismatch in JS chunk: assets/${jsFile}`);
      }
    }
    log(`All ${sourceJsFiles.length} JS chunks: 100% BYTE-FOR-BYTE IDENTICAL`);
  }

  // 7. COMPUTE FULL DETERMINISTIC FINGERPRINT FROM APK BYTES (Requirement 9)
  const apkFingerprint = calculateDeterministicFingerprint(extractedPublicDir);
  const sourceFingerprint = calculateDeterministicFingerprint(SOURCE_DIR);

  log(`APK computed content fingerprint:    ${apkFingerprint.hash} (${apkFingerprint.count} files)`);
  log(`Source computed content fingerprint: ${sourceFingerprint.hash} (${sourceFingerprint.count} files)`);

  if (apkFingerprint.hash !== sourceFingerprint.hash || apkFingerprint.count !== sourceFingerprint.count) {
    throw new Error(`Content fingerprint mismatch between APK and Source!\nAPK:    ${apkFingerprint.hash} (${apkFingerprint.count})\nSource: ${sourceFingerprint.hash} (${sourceFingerprint.count})`);
  }

  console.log('\n=========================================');
  console.log('REAL APK ASSET VERIFICATION: PASSED');
  console.log('=========================================');
  console.log(`APK:                  ${apkPath}`);
  console.log(`Web Build:            ${apkBuildInfo.web}`);
  console.log(`Build Number:         ${apkBuildInfo.build}`);
  console.log(`Packaging:            ${apkBuildInfo.packaging}`);
  console.log(`OTA:                  ${apkBuildInfo.ota ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Deterministic SHA256: ${apkFingerprint.hash}`);
  console.log(`Files Verified:       ${apkFingerprint.count} (including index.html & all JS chunks)`);
  console.log('Result:               APK matches source assets byte-for-byte.');
  console.log('=========================================\n');

} catch (err) {
  fs.rmSync(tempDir, { recursive: true, force: true });
  error(err.message);
}

// Clean up sandbox
fs.rmSync(tempDir, { recursive: true, force: true });
process.exit(0);
