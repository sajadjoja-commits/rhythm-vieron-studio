/*
 * Publishes a web-only release to the same Capgo channel used by Android.
 * This is deliberately separate from `vieron:sync`: syncing copies files into
 * a local APK; it does not publish anything to devices already installed.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const token = process.env.CAPGO_TOKEN;
const channel = process.env.CAPGO_CHANNEL || 'staging';
const appId = '4ff5064c-bd8c-4b62-b998-25e5da1d59c5';

if (!token) {
  console.error('CAPGO_TOKEN is required. Create a Capgo API key and set it only in your terminal/CI secrets.');
  process.exit(1);
}

try {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit' });
  execFileSync(
    npx,
    ['@capgo/cli@latest', 'bundle', 'upload', appId, '--path', './dist', `--channel=${channel}`, '--auto-bump', '--apikey', token],
    { cwd: root, stdio: 'inherit' }
  );
} catch (error) {
  process.exit(error.status || 1);
}
