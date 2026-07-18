import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPLASH_DIR = path.join(__dirname, '..', 'public', 'splash');

async function convertSVGs() {
  console.log('🔄 Converting SVG splash screens to PNG...');

  const files = fs.readdirSync(SPLASH_DIR).filter(f => f.endsWith('.svg'));

  for (const file of files) {
    const svgPath = path.join(SPLASH_DIR, file);
    const pngPath = path.join(SPLASH_DIR, file.replace('.svg', '.png'));

    const svgBuffer = fs.readFileSync(svgPath);
    await sharp(svgBuffer)
      .png()
      .toFile(pngPath);

    console.log(`  ✓ ${file} → ${file.replace('.svg', '.png')}`);
  }

  // Clean up SVG files
  for (const file of files) {
    fs.unlinkSync(path.join(SPLASH_DIR, file));
  }

  console.log('');
  console.log('✅ All splash screens converted to PNG!');
  console.log(`📁 Saved to: ${SPLASH_DIR}`);
}

convertSVGs().catch(console.error);
