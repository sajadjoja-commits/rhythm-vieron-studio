#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const webDir = path.join(root, 'dist');
const androidDir = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public');

function fail(message) {
  console.error(`\n[Vieron] WEB ASSET VERIFICATION FAILED\n${message}\n`);
  process.exit(1);
}

function collectFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(absolute, base));
    else if (entry.isFile()) files.push(path.relative(base, absolute).replace(/\\/g, '/'));
  }
  return files.sort();
}

function digestFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

if (!fs.existsSync(webDir)) fail(`Missing ${path.relative(root, webDir)}. Run npm run build first.`);
if (!fs.existsSync(androidDir)) fail(`Missing ${path.relative(root, androidDir)}. Run npx cap sync android first.`);

const webFiles = collectFiles(webDir);
const androidFiles = collectFiles(androidDir);

if (webFiles.length === 0) fail('dist is empty. Refusing to package an empty web application.');

const webSet = new Set(webFiles);
const androidSet = new Set(androidFiles);
const missing = webFiles.filter((file) => !androidSet.has(file));
const extra = androidFiles.filter((file) => !webSet.has(file));
const changed = webFiles.filter((file) => {
  if (!androidSet.has(file)) return false;
  return digestFile(path.join(webDir, file)) !== digestFile(path.join(androidDir, file));
});

if (missing.length || extra.length || changed.length) {
  console.error('[Vieron] Embedded Android web assets do not match dist.');
  if (missing.length) console.error(`Missing in Android assets (${missing.length}):\n  ${missing.slice(0, 20).join('\n  ')}`);
  if (extra.length) console.error(`Extra in Android assets (${extra.length}):\n  ${extra.slice(0, 20).join('\n  ')}`);
  if (changed.length) console.error(`Changed files (${changed.length}):\n  ${changed.slice(0, 20).join('\n  ')}`);
  console.error('\nRun: npm run vieron:sync');
  process.exit(1);
}

const manifest = crypto.createHash('sha256');
for (const file of webFiles) manifest.update(`${file}\0${digestFile(path.join(webDir, file))}\n`);
console.log(`[Vieron] Web assets verified: ${webFiles.length} files`);
console.log(`[Vieron] Fingerprint: ${manifest.digest('hex').slice(0, 16)}`);
