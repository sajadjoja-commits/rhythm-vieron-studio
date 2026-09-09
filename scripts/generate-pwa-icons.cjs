const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generate() {
  const publicDir = path.join(__dirname, '..', 'public');
  
  // 1. Regular icon SVG (full bleed with dark background and rounded look)
  const regularSvg = (size) => `
    <svg width="${size}" height="${size}" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="110" fill="#090d16"/>
      <defs>
        <linearGradient id="vGlowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="30%" stop-color="#3b82f6" />
          <stop offset="70%" stop-color="#6366f1" />
          <stop offset="100%" stop-color="#a855f7" />
        </linearGradient>
      </defs>
      <circle cx="256" cy="256" r="230" stroke="url(#vGlowGradient)" stroke-width="6" stroke-opacity="0.2" fill="none" />
      <path
        d="M 112 120 L 190 120 L 256 340 L 322 120 L 400 120 L 295 400 C 275 440 237 440 217 400 Z"
        fill="url(#vGlowGradient)"
      />
    </svg>
  `;

  // 2. Maskable icon SVG (Solid background to edges, centered symbol within safe zone - 80% diameter)
  const maskableSvg = (size) => `
    <svg width="${size}" height="${size}" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="#090d16"/>
      <defs>
        <linearGradient id="vMaskGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="30%" stop-color="#3b82f6" />
          <stop offset="70%" stop-color="#6366f1" />
          <stop offset="100%" stop-color="#a855f7" />
        </linearGradient>
      </defs>
      <!-- Safe zone centered V logo scaled to 70% -->
      <g transform="translate(76.8, 76.8) scale(0.7)">
        <path
          d="M 112 120 L 190 120 L 256 340 L 322 120 L 400 120 L 295 400 C 275 440 237 440 217 400 Z"
          fill="url(#vMaskGradient)"
        />
      </g>
    </svg>
  `;

  // Sizes to render
  const standardSizes = [
    { name: 'icon-64.png', size: 64 },
    { name: 'icon-128.png', size: 128 },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-384.png', size: 384 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon.png', size: 64 },
  ];

  for (const item of standardSizes) {
    const svgBuffer = Buffer.from(regularSvg(item.size));
    const dest = path.join(publicDir, item.name);
    await sharp(svgBuffer).png().toFile(dest);
    console.log(`Generated: ${item.name} (${item.size}x${item.size})`);
  }

  const maskableSizes = [
    { name: 'icon-maskable-192.png', size: 192 },
    { name: 'icon-maskable-512.png', size: 512 },
  ];

  for (const item of maskableSizes) {
    const svgBuffer = Buffer.from(maskableSvg(item.size));
    const dest = path.join(publicDir, item.name);
    await sharp(svgBuffer).png().toFile(dest);
    console.log(`Generated Maskable: ${item.name} (${item.size}x${item.size})`);
  }

  // 3. Screenshots (valid high quality JPEGs with dark theme and studio preview mockup)
  const mobileScreenshotSvg = `
    <svg width="720" height="1280" viewBox="0 0 720 1280" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="720" height="1280" fill="#090d16"/>
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="50%" stop-color="#090d16" />
          <stop offset="100%" stop-color="#1e1b4b" />
        </linearGradient>
        <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="100%" stop-color="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="720" height="1280" fill="url(#bgGrad)"/>
      <!-- Header -->
      <rect x="40" y="60" width="640" height="70" rx="16" fill="#1e293b" fill-opacity="0.6"/>
      <text x="360" y="105" fill="#f8fafc" font-size="28" font-family="sans-serif" font-weight="bold" text-anchor="middle">Vireon AI Studio</text>
      <!-- Video Player Mockup -->
      <rect x="60" y="170" width="600" height="680" rx="24" fill="#020617" stroke="#334155" stroke-width="2"/>
      <circle cx="360" cy="510" r="48" fill="url(#accentGrad)"/>
      <polygon points="350,490 380,510 350,530" fill="#ffffff"/>
      <!-- Timeline & Tools -->
      <rect x="60" y="880" width="600" height="180" rx="20" fill="#1e293b" fill-opacity="0.8"/>
      <rect x="80" y="910" width="160" height="50" rx="10" fill="#38bdf8" fill-opacity="0.3"/>
      <rect x="260" y="910" width="220" height="50" rx="10" fill="#818cf8" fill-opacity="0.3"/>
      <rect x="500" y="910" width="140" height="50" rx="10" fill="#c084fc" fill-opacity="0.3"/>
      <!-- Bottom bar -->
      <rect x="60" y="1100" width="600" height="90" rx="24" fill="url(#accentGrad)"/>
      <text x="360" y="1155" fill="#ffffff" font-size="26" font-family="sans-serif" font-weight="bold" text-anchor="middle">تصدير الفيديو بالذكاء الاصطناعي</text>
    </svg>
  `;

  const desktopScreenshotSvg = `
    <svg width="1280" height="720" viewBox="0 0 1280 720" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="1280" height="720" fill="#090d16"/>
      <defs>
        <linearGradient id="dtBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1e1b4b" />
        </linearGradient>
        <linearGradient id="dtAccentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="100%" stop-color="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#dtBgGrad)"/>
      <!-- Top Nav -->
      <rect x="0" y="0" width="1280" height="60" fill="#0f172a" stroke="#1e293b" stroke-width="1"/>
      <text x="60" y="38" fill="#f8fafc" font-size="20" font-family="sans-serif" font-weight="bold">Vireon AI Video Studio</text>
      <!-- Left sidebar -->
      <rect x="0" y="60" width="80" height="660" fill="#090d16" stroke="#1e293b" stroke-width="1"/>
      <!-- Center Canvas -->
      <rect x="100" y="80" width="760" height="420" rx="16" fill="#020617" stroke="#334155" stroke-width="2"/>
      <circle cx="480" cy="290" r="40" fill="url(#dtAccentGrad)"/>
      <polygon points="472,274 496,290 472,306" fill="#ffffff"/>
      <!-- Right tools panel -->
      <rect x="880" y="80" width="370" height="610" rx="16" fill="#1e293b" fill-opacity="0.6" stroke="#334155" stroke-width="1"/>
      <text x="1065" y="125" fill="#f8fafc" font-size="18" font-family="sans-serif" font-weight="bold" text-anchor="middle">لوحة الذكاء الاصطناعي والمؤثرات</text>
      <!-- Bottom Timeline -->
      <rect x="100" y="520" width="760" height="170" rx="16" fill="#1e293b" fill-opacity="0.8"/>
    </svg>
  `;

  await sharp(Buffer.from(mobileScreenshotSvg)).jpeg({ quality: 90 }).toFile(path.join(publicDir, 'screenshot-mobile.jpg'));
  console.log('Generated: screenshot-mobile.jpg (720x1280)');

  await sharp(Buffer.from(desktopScreenshotSvg)).jpeg({ quality: 90 }).toFile(path.join(publicDir, 'screenshot-desktop.jpg'));
  console.log('Generated: screenshot-desktop.jpg (1280x720)');
}

generate().catch(console.error);
