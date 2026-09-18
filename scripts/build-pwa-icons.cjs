const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Generating valid PWA icons and screenshots...');

const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Helper to run convert
function makeIcon(filename, size, isMaskable = false, isApple = false) {
  const outFile = path.join(publicDir, filename);
  const pad = isMaskable ? Math.round(size * 0.15) : Math.round(size * 0.05);
  const r = Math.round(size * 0.16);
  const cX = Math.round(size / 2);
  const cY = Math.round(size / 2);

  // Path coordinates scaled to size
  const left = Math.round(size * 0.28);
  const right = Math.round(size * 0.72);
  const top = Math.round(size * 0.28);
  const bottom = Math.round(size * 0.74);
  const innerLeft = Math.round(size * 0.38);
  const innerRight = Math.round(size * 0.62);
  const innerTop = Math.round(size * 0.28);
  const innerMid = Math.round(size * 0.52);

  const dotY = Math.round(size * 0.38);
  const dotR = Math.max(2, Math.round(size * 0.03));

  let bgCmd = `roundrectangle ${pad},${pad} ${size - pad},${size - pad} ${r},${r}`;
  if (isMaskable) {
    bgCmd = `rectangle 0,0 ${size},${size}`;
  }

  const drawCmd = [
    `convert -size ${size}x${size} xc:'#090d16'`,
    `-fill '#1e1b4b' -draw "${bgCmd}"`,
    `-fill '#8b5cf6' -draw "path 'M ${left},${top} L ${cX},${bottom} L ${right},${top} L ${innerRight},${top} L ${cX},${innerMid} L ${innerLeft},${top} Z'"`,
    `-fill '#ec4899' -draw "circle ${cX},${dotY} ${cX},${dotY + dotR}"`,
    `"${outFile}"`
  ].join(' ');

  execSync(drawCmd);

  // Verify header
  const buf = fs.readFileSync(outFile);
  const header = buf.subarray(0, 8).toString('hex');
  if (header !== '89504e470d0a1a0a') {
    throw new Error(`Corrupt header in ${filename}: ${header}`);
  }
  console.log(`✅ ${filename} (${size}x${size}): ${buf.length} bytes, header OK`);
}

function makeScreenshot(filename, width, height, title) {
  const outFile = path.join(publicDir, filename);
  const drawCmd = [
    `convert -size ${width}x${height} xc:'#090d16'`,
    `-fill '#1e293b' -draw "roundrectangle 40,40 ${width - 40},${height - 40} 24,24"`,
    `-fill '#8b5cf6' -draw "roundrectangle 80,80 ${width - 80},${Math.round(height * 0.4)} 16,16"`,
    `-fill '#06b6d4' -draw "circle ${Math.round(width / 2)},${Math.round(height * 0.6)} ${Math.round(width / 2)},${Math.round(height * 0.6 + 40)}"`,
    `-quality 92 "${outFile}"`
  ].join(' ');

  execSync(drawCmd);

  const buf = fs.readFileSync(outFile);
  const header = buf.subarray(0, 3).toString('hex');
  if (header !== 'ffd8ff') {
    throw new Error(`Corrupt JPEG header in ${filename}: ${header}`);
  }
  console.log(`✅ ${filename} (${width}x${height}): ${buf.length} bytes, JPEG header OK`);
}

try {
  makeIcon('icon-64.png', 64);
  makeIcon('icon-128.png', 128);
  makeIcon('icon-192.png', 192);
  makeIcon('icon-384.png', 384);
  makeIcon('icon-512.png', 512);
  makeIcon('icon-maskable-192.png', 192, true);
  makeIcon('icon-maskable-512.png', 512, true);
  makeIcon('apple-touch-icon.png', 180, false, true);
  makeIcon('favicon.png', 64);

  makeScreenshot('screenshot-mobile.jpg', 720, 1280, 'Mobile Preview');
  makeScreenshot('screenshot-desktop.jpg', 1280, 720, 'Desktop Studio');
  makeScreenshot('music_album_cover.jpg', 800, 800, 'Album Cover');

  console.log('\nAll PWA icons and screenshots built successfully and validated!');
} catch (err) {
  console.error('Failed to generate PWA icons:', err);
  process.exit(1);
}
