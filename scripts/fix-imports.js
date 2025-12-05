#!/usr/bin/env node
/**
 * Simple post-build script: walk `dist/` and add `.js` extension to
 * relative import/export specifiers that lack an extension (and convert
 * `.ts` -> `.js`). This makes tsc ESM output runnable by Node without
 * experimental resolution hacks.
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
  // Match quoted relative paths like './foo' or '../bar/baz'
  const re = /(["'])(\.\.\/|\.\/)([^"']+?)\1/g;
  let changed = false;
  s = s.replace(re, (m, quote, prefix, rest) => {
    // Leave alone if contains a query/hash
    if (rest.includes('?') || rest.includes('#')) return m;
    // If already has an extension (.js, .json, .node, etc.) leave it
    if (/\.[a-zA-Z0-9]+$/.test(rest) && !rest.endsWith('.ts')) return m;
    let newRest = rest;
    if (newRest.endsWith('.ts')) newRest = newRest.replace(/\.ts$/, '.js');
    if (!/\.[a-zA-Z0-9]+$/.test(newRest)) newRest = newRest + '.js';
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
