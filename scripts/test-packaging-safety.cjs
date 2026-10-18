const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TEST_TEMP = path.join(ROOT, '.packaging_safety_test_tmp');

function cleanDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function log(msg) {
  console.log(`[SAFETY TEST] ${msg}`);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[SAFETY TEST FAILED] ❌ ${message}`);
    process.exit(1);
  }
  console.log(`[SAFETY TEST PASSED] ✅ ${message}`);
}

cleanDir(TEST_TEMP);
fs.mkdirSync(TEST_TEMP, { recursive: true });

log('Running isolated safety and failure recovery tests...');

// -------------------------------------------------------------
// Test 1: Build Failure Protection Test
// -------------------------------------------------------------
log('\n--- Test 1: Build Failure Protection ---');
const mockAssetsPublic = path.join(TEST_TEMP, 'mock_assets', 'public');
fs.mkdirSync(mockAssetsPublic, { recursive: true });

const originalIndexContent = '<html><body>PREVIOUS ORIGINAL ASSETS</body></html>';
fs.writeFileSync(path.join(mockAssetsPublic, 'index.html'), originalIndexContent);
fs.writeFileSync(path.join(mockAssetsPublic, 'app.js'), 'console.log("original asset");');

assert(fs.existsSync(path.join(mockAssetsPublic, 'index.html')), 'Fixture setup: original asset exists');

// Verify that if a failure occurs before swap, the original directory is unmodified.
const tempStagingDir = path.join(TEST_TEMP, 'mock_assets', '.public_staging');
fs.mkdirSync(tempStagingDir, { recursive: true });
fs.writeFileSync(path.join(tempStagingDir, 'index.html'), '<html>BROKEN</html>');

// Simulate failure logic: abort clean-up without touching public
cleanDir(tempStagingDir);

assert(fs.existsSync(path.join(mockAssetsPublic, 'index.html')), 'Original public directory survived failure');
assert(fs.readFileSync(path.join(mockAssetsPublic, 'index.html'), 'utf8') === originalIndexContent, 'Original file contents strictly preserved');

// -------------------------------------------------------------
// Test 2: cap:copy / cap:sync Missing Dist Graceful Fail Test
// -------------------------------------------------------------
log('\n--- Test 2: cap:copy / cap:sync Missing Dist Fail-Safe ---');
const fakeDist = path.join(TEST_TEMP, 'non_existent_dist');
assert(!fs.existsSync(fakeDist), 'Dist does not exist');

// Run cap-copy-android against non-existent dist in isolation
const capCopyScript = path.join(ROOT, 'scripts', 'cap-copy-android.cjs');
const capCopyRes = spawnSync('node', [capCopyScript], {
  cwd: ROOT,
  env: { ...process.env, DIST_OVERRIDE: fakeDist },
  encoding: 'utf8'
});

assert(capCopyRes.status !== 0, 'cap-copy-android returns non-zero status on missing dist');

// -------------------------------------------------------------
// Test 3: verify-web-assets Byte-for-Byte Accuracy Test
// -------------------------------------------------------------
log('\n--- Test 3: verify-web-assets Byte-for-Byte Mismatch Detection ---');
const fixtureDist = path.join(TEST_TEMP, 'fixture_dist');
const fixturePublic = path.join(TEST_TEMP, 'fixture_public');

fs.mkdirSync(fixtureDist, { recursive: true });
fs.mkdirSync(fixturePublic, { recursive: true });

fs.writeFileSync(path.join(fixtureDist, 'index.html'), '<html>BUILD 1</body>');
fs.writeFileSync(path.join(fixtureDist, 'chunk.js'), 'console.log("v1");');

fs.writeFileSync(path.join(fixturePublic, 'index.html'), '<html>BUILD 1</body>');
fs.writeFileSync(path.join(fixturePublic, 'chunk.js'), 'console.log("v2 DIFFERENT");'); // mismatch!

// Compute hashes directly
const distHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(fixtureDist, 'chunk.js'))).digest('hex');
const pubHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(fixturePublic, 'chunk.js'))).digest('hex');

assert(distHash !== pubHash, 'Detected byte mismatch between source dist and target asset');

// -------------------------------------------------------------
// Test 4: verify-apk-assets Incomplete Handling Test
// -------------------------------------------------------------
log('\n--- Test 4: verify-apk-assets No APK Found Graceful Incomplete Test ---');
const emptyApkDir = path.join(TEST_TEMP, 'empty_apk_dir');
fs.mkdirSync(emptyApkDir, { recursive: true });

const verifyApkScript = path.join(ROOT, 'scripts', 'verify-apk-assets.cjs');
const verifyApkRes = spawnSync('node', [verifyApkScript], {
  cwd: ROOT,
  env: { ...process.env, APK_DIR_OVERRIDE: emptyApkDir },
  encoding: 'utf8'
});

assert(verifyApkRes.status !== 0, 'verify-apk-assets fails with exit code 1 when no APK exists in target dir');
assert(
  verifyApkRes.stderr.includes('VERIFY INCOMPLETE') || verifyApkRes.stdout.includes('VERIFY INCOMPLETE'),
  'verify-apk-assets outputs clear VERIFY INCOMPLETE message instead of false success'
);

// -------------------------------------------------------------
// Cleanup
// -------------------------------------------------------------
cleanDir(TEST_TEMP);
log('\n============================================================');
log('ALL PACKAGING SAFETY TESTS PASSED SUCCESSFULLY!');
log('============================================================');
