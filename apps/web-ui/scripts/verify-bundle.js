#!/usr/bin/env node
/**
 * Post-build checks: production dist must not ship import maps, /engine/ static URLs,
 * or bare Node built-in imports in bundled assets.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

const forbidden = [
  { label: 'importmap', re: /type\s*=\s*["']importmap["']/i },
  { label: 'bare fs import', re: /from\s+["']fs["']/ },
  { label: 'bare path import', re: /from\s+["']path["']/ },
  // Literal URL paths only (not @beatbax/engine package specifiers)
  { label: '/engine/ URL', re: /["'`]\/engine\// },
];

function shouldCheck(file) {
  if (!/\.(html|js|mjs)$/.test(file)) return false;
  const rel = path.relative(distDir, file).replace(/\\/g, '/');
  // Skip legacy copied engine tree if it still exists under public/
  if (rel.startsWith('engine/')) return false;
  return rel === 'index.html' || rel.startsWith('assets/');
}

if (!fs.existsSync(distDir)) {
  console.error('verify-bundle: dist/ not found — run vite build first');
  process.exit(1);
}

const files = walk(distDir).filter(shouldCheck);
let failed = false;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const { label, re } of forbidden) {
    if (re.test(text)) {
      console.error(`verify-bundle: ${label} found in ${path.relative(distDir, file)}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('verify-bundle: OK (%d files checked)', files.length);
