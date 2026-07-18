const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SPLASH_DIR = path.join(__dirname, '..', 'public', 'splash');

// iOS Splash Screen Specs (device-width, device-height, pixelRatio, filename)
const SPLASH_SCREENS = [
  // iPhone
  { w: 430, h: 932, r: 3, name: 'iPhone_14_Pro_Max' },
  { w: 393, h: 852, r: 3, name: 'iPhone_14_Pro' },
  { w: 390, h: 844, r: 3, name: 'iPhone_14' },
  { w: 375, h: 812, r: 3, name: 'iPhone_13_mini' },
  { w: 414, h: 896, r: 3, name: 'iPhone_11_Pro_Max' },
  { w: 414, h: 896, r: 2, name: 'iPhone_11' },
  { w: 414, h: 736, r: 3, name: 'iPhone_8_Plus' },
  { w: 375, h: 667, r: 2, name: 'iPhone_8' },
  // iPad
  { w: 810, h: 1080, r: 2, name: 'iPad_10.2' },
  { w: 834, h: 1194, r: 2, name: 'iPad_Pro_11' },
  { w: 834, h: 1112, r: 2, name: 'iPad_Air_10.5' },
  { w: 768, h: 1024, r: 2, name: 'iPad_Mini' },
  { w: 1024, h: 1366, r: 2, name: 'iPad_Pro_12.9' },
];

function generateSVG(width, height, name) {
  const cx = width / 2;
  const cy = height / 2;
  const logoSize = Math.min(width, height) * 0.2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#0a1628" />
      <stop offset="50%" stop-color="#02060d" />
      <stop offset="100%" stop-color="#000000" />
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bg)" />

  <!-- Grid lines -->
  <g stroke="rgba(34,211,238,0.03)" stroke-width="0.5">
    ${Array.from({ length: Math.floor(width / 30) }, (_, i) => `    <line x1="${i * 30}" y1="0" x2="${i * 30}" y2="${height}" />`).join('\n')}
    ${Array.from({ length: Math.floor(height / 30) }, (_, i) => `    <line x1="0" y1="${i * 30}" x2="${width}" y2="${i * 30}" />`).join('\n')}
  </g>

  <!-- Center glow -->
  <circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) * 0.25}" fill="rgba(34,211,238,0.04)" />

  <!-- AXE Logo -->
  <g transform="translate(${cx - logoSize / 2}, ${cy - logoSize / 2 - height * 0.05})" filter="url(#glow)">
    <polygon points="${logoSize * 0.5},0 ${logoSize},${logoSize} ${logoSize * 0.75},${logoSize} ${logoSize * 0.5},${logoSize * 0.4} ${logoSize * 0.25},${logoSize} 0,${logoSize}"
      fill="none" stroke="#22d3ee" stroke-width="2" />
    <line x1="${logoSize * 0.15}" y1="${logoSize * 0.7}" x2="${logoSize * 0.85}" y2="${logoSize * 0.7}"
      stroke="#22d3ee" stroke-width="1.5" />
  </g>

  <!-- Text -->
  <text x="${cx}" y="${cy + logoSize * 0.8 + 20}" text-anchor="middle"
    font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="${Math.min(width, height) * 0.045}"
    fill="#22d3ee" letter-spacing="0.3em">
    AXE CORE
  </text>

  <!-- Subtitle -->
  <text x="${cx}" y="${cy + logoSize * 0.8 + 20 + Math.min(width, height) * 0.035}"
    text-anchor="middle"
    font-family="monospace" font-weight="400" font-size="${Math.min(width, height) * 0.02}"
    fill="rgba(34,211,238,0.5)" letter-spacing="0.15em">
    GLOBAL SURVEILLANCE
  </text>

  <!-- Status bar area simulation (safe area) -->
  <rect x="0" y="0" width="${width}" height="${height * 0.03}" fill="rgba(0,0,0,0.3)" />
  <rect x="0" y="${height * 0.97}" width="${width}" height="${height * 0.03}" fill="rgba(0,0,0,0.3)" />
</svg>
`.trim();
}

function generatePNGs() {
  console.log('🎨 Generating AXE CORE splash screens...');
  console.log('');

  for (const spec of SPLASH_SCREENS) {
    const pixelW = spec.w * spec.r;
    const pixelH = spec.h * spec.r;
    const svgContent = generateSVG(pixelW, pixelH, spec.name);
    const svgPath = path.join(SPLASH_DIR, `${spec.name}.svg`);
    const pngPath = path.join(SPLASH_DIR, `${spec.name}.png`);

    fs.writeFileSync(svgPath, svgContent);
    console.log(`  ✓ ${spec.name}: ${pixelW}x${pixelH}`);
  }

  console.log('');
  console.log('✅ All SVG splash screens generated!');
  console.log('');
  console.log('💡 To convert SVGs to PNGs, install ImageMagick and run:');
  console.log('   for f in public/splash/*.svg; do magick "$f" "${f%.svg}.png"; done');
  console.log('');
  console.log('   Or use a build tool like sharp: npm install sharp');
  console.log('');
}

// Ensure directory exists
if (!fs.existsSync(SPLASH_DIR)) {
  fs.mkdirSync(SPLASH_DIR, { recursive: true });
}

generatePNGs();
