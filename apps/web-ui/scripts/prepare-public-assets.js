#!/usr/bin/env node
// Copy sample songs into public/ so the dev server can serve them at /songs/*
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const songsSrc = path.join(repoRoot, 'songs');
const songsTarget = path.join(__dirname, '..', 'public', 'songs');
const legacyEnginePublic = path.join(__dirname, '..', 'public', 'engine');

// Remove deprecated copied engine tree (bundled via Vite now).
if (fs.existsSync(legacyEnginePublic)) {
  fs.rmSync(legacyEnginePublic, { recursive: true, force: true });
  console.log('Removed legacy public/engine copy');
}

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

if (fs.existsSync(songsSrc)) {
  copyRecursive(songsSrc, songsTarget);
  console.log('Copied songs ->', songsTarget);
} else {
  console.warn('No songs folder at', songsSrc);
}
