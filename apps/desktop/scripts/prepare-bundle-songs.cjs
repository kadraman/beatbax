const fs = require('fs');
const path = require('path');

const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..', '..');
const songsSrc = path.join(repoRoot, 'songs');
const songsTarget = path.join(desktopRoot, 'build', 'songs');

/** Chip folders whose top-level .bax files are complete example songs. */
const EXAMPLE_CHIP_DIRS = ['gameboy', 'nes', 'sms'];

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyTree(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(srcPath, destPath);
    else copyFile(srcPath, destPath);
  }
}

function copyChipExampleSongs() {
  let copied = 0;

  const rootSample = path.join(songsSrc, 'sample.bax');
  if (fs.existsSync(rootSample)) {
    copyFile(rootSample, path.join(songsTarget, 'sample.bax'));
    copied += 1;
  }

  for (const chipDir of EXAMPLE_CHIP_DIRS) {
    const chipPath = path.join(songsSrc, chipDir);
    if (!fs.existsSync(chipPath)) continue;

    for (const entry of fs.readdirSync(chipPath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.bax')) continue;
      copyFile(path.join(chipPath, entry.name), path.join(songsTarget, chipDir, entry.name));
      copied += 1;
    }
  }

  const nesSamples = path.join(songsSrc, 'nes', 'samples');
  if (fs.existsSync(nesSamples)) {
    copyTree(nesSamples, path.join(songsTarget, 'nes', 'samples'));
  }

  return copied;
}

if (!fs.existsSync(songsSrc)) {
  console.error('Songs source folder not found:', songsSrc);
  process.exit(1);
}

if (fs.existsSync(songsTarget)) {
  fs.rmSync(songsTarget, { recursive: true, force: true });
}

const songCount = copyChipExampleSongs();
console.log(`Bundled ${songCount} example song(s) -> ${songsTarget}`);
