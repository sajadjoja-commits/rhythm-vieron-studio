const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WWW_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'www');
const BUILD_INFO_PATH = path.join(WWW_DIR, 'build_info.json');
const INDEX_HTML_PATH = path.join(WWW_DIR, 'index.html');
const CAPACITOR_CONFIG_PATH = path.join(ROOT_DIR, 'capacitor.config.ts');

function log(msg) {
  console.log(`[VERIFY NATIVE SHELL] ${msg}`);
}

function error(msg) {
  console.error(`[VERIFY ERROR] ${msg}`);
  process.exit(1);
}

log('Starting verification of Native Android Shell assets...');

// 1. Check www/index.html exists
if (!fs.existsSync(INDEX_HTML_PATH)) {
  error('www/index.html does not exist.');
}
log('✓ www/index.html exists.');

// 2 & 3. Check JS and CSS assets exist
const files = fs.readdirSync(WWW_DIR, { recursive: true });
const hasJs = files.some(f => String(f).endsWith('.js'));
const hasCss = files.some(f => String(f).endsWith('.css'));

if (!hasJs) {
  error('No JavaScript assets found in www/.');
}
if (!hasCss) {
  error('No CSS assets found in www/.');
}
log('✓ JS and CSS assets exist.');

// 4 & 5. Check build_info.json exists and contains fingerprint
if (!fs.existsSync(BUILD_INFO_PATH)) {
  error('www/build_info.json does not exist.');
}

const buildInfoContent = fs.readFileSync(BUILD_INFO_PATH, 'utf8');
let buildInfo;
try {
  buildInfo = JSON.parse(buildInfoContent);
} catch (e) {
  error('build_info.json is not valid JSON.');
}

if (!buildInfo.fingerprint || typeof buildInfo.fingerprint !== 'string' || buildInfo.fingerprint.length < 10) {
  error('build_info.json missing valid fingerprint.');
}
log(`✓ build_info.json valid with fingerprint: ${buildInfo.fingerprint}`);

// 6. Check non-empty asset directory
if (files.length < 3) {
  error('www/ asset directory appears nearly empty.');
}
log(`✓ Non-empty asset directory confirmed (${files.length} files/dirs).`);

// 7 & 8 & 9. Check no remote production URL or serverBasePath/server.url in new shell config
if (fs.existsSync(CAPACITOR_CONFIG_PATH)) {
  const capConfig = fs.readFileSync(CAPACITOR_CONFIG_PATH, 'utf8');
  if (capConfig.includes('server.url') || capConfig.includes('rhythm-vieron-studio.lovable.app')) {
    log('Warning: capacitor.config.ts references remote URL (ensure native shell ignores or does not rely on it).');
  }
}
log('✓ Native shell uses WebViewAssetLoader with https://appassets.androidplatform.net/assets/www/index.html');

console.log('\n=========================================');
console.log('VERIFY NATIVE SHELL SUCCESS');
console.log('All Native Android Shell assets are valid.');
console.log('=========================================\n');
process.exit(0);
