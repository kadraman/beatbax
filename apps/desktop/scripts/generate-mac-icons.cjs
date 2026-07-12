#!/usr/bin/env node
/**
 * Generate macOS .icns files with all required icon sizes from a source PNG.
 *
 * Usage: node scripts/generate-mac-icons.cjs [sourcePng]
 * Default source: build/icon.png
 * Outputs: build/icon.icns, build/file-bax.icns
 */

const { execSync } = require('node:child_process');
const { existsSync, mkdirSync, rmSync, copyFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const desktopRoot = resolve(__dirname, '..');
const buildDir = join(desktopRoot, 'build');
const sourcePng = resolve(process.argv[2] ?? join(buildDir, 'icon.png'));

const ICON_SIZES = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

function buildIcns(iconsetName, outputIcns) {
  const iconsetDir = join(buildDir, `${iconsetName}.iconset`);
  rmSync(iconsetDir, { recursive: true, force: true });
  mkdirSync(iconsetDir, { recursive: true });

  for (const { name, size } of ICON_SIZES) {
    const outPath = join(iconsetDir, name);
    execSync(`sips -z ${size} ${size} "${sourcePng}" --out "${outPath}"`, { stdio: 'inherit' });
  }

  const icnsPath = join(buildDir, outputIcns);
  rmSync(icnsPath, { force: true });
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'inherit' });
  } finally {
    rmSync(iconsetDir, { recursive: true, force: true });
  }
  console.log(`Wrote ${icnsPath}`);
}

if (!existsSync(sourcePng)) {
  console.error(`Source PNG not found: ${sourcePng}`);
  process.exit(1);
}

if (process.platform !== 'darwin') {
  console.warn('generate-mac-icons: sips/iconutil require macOS; skipping icon regeneration.');
  process.exit(0);
}

buildIcns('beatbax-app', 'icon.icns');
copyFileSync(join(buildDir, 'icon.icns'), join(buildDir, 'file-bax.icns'));
console.log(`Wrote ${join(buildDir, 'file-bax.icns')} (copy of icon.icns)`);
