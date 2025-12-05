#!/usr/bin/env node
/**
 * Post-build CommonJS script to rewrite relative import specifiers in
 * compiled ESM outputs so Node can resolve them (add .js, convert .ts -> .js).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      walk(p);
    } else if (e.isFile() && p.endsWith('.js')) {
      fixFile(p);
    }
  }
}

function fixFile(file) {
  let s = fs.readFileSync(file, 'utf8');
  const re = /(["'])(\.\.\/|\.\/)([^"']+?)\1/g;
  let changed = false;
  s = s.replace(re, (m, quote, prefix, rest) => {
    if (rest.includes('?') || rest.includes('#')) return m;
    if (/\.[a-zA-Z0-9]+$/.test(rest) && !rest.endsWith('.ts')) return m;
    let newRest = rest;
    if (newRest.endsWith('.ts')) newRest = newRest.replace(/\.ts$/, '.js');

    // Resolve against the current file directory to decide between
    // adding '.js' or '/index.js' when the import points to a folder.
    const fileDir = path.dirname(file);
    const candidate1 = path.resolve(fileDir, prefix + newRest + '.js');
    const candidate2 = path.resolve(fileDir, prefix + newRest, 'index.js');
    if (fs.existsSync(candidate1)) {
      newRest = newRest + '.js';
    } else if (fs.existsSync(candidate2)) {
      newRest = newRest + '/index.js';
    } else {
      // default to adding .js
      if (!/\.[a-zA-Z0-9]+$/.test(newRest)) newRest = newRest + '.js';
    }
    changed = true;
    return quote + prefix + newRest + quote;
  });
  if (changed) {
    fs.writeFileSync(file, s, 'utf8');
    console.log('Patched imports in', file);
  }
}

if (!fs.existsSync(DIST)) {
  console.error('No dist directory found; run tsc first.');
  process.exit(1);
}

walk(DIST);
console.log('Import specifier rewrite complete.');
