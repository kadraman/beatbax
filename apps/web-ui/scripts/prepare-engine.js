#!/usr/bin/env node
// Copy the built engine `dist` into this app's `public/engine` so the
// production build can load a standalone ESM artifact at /engine/index.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const engineDist = path.join(repoRoot, 'packages', 'engine', 'dist');
const target = path.join(__dirname, '..', 'public', 'engine');

const songsSrc = path.join(repoRoot, 'songs');
const songsTarget = path.join(__dirname, '..', 'public', 'songs');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
  return true;
}

// Ensure engine was built
if (!fs.existsSync(engineDist)) {
  console.warn('Engine dist not found at', engineDist, '\nRun `npm --prefix packages/engine run build` first.');
  process.exitCode = 0;
} else {
  copyRecursive(engineDist, target);
  console.log('Copied engine dist ->', target);
}

// Copy sample songs into public so the dev server can serve them at /songs/*
if (fs.existsSync(songsSrc)) {
  copyRecursive(songsSrc, songsTarget);
  console.log('Copied songs ->', songsTarget);
} else {
  console.warn('No songs folder at', songsSrc);
}
