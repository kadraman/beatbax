#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const packagesDir = path.join(repoRoot, 'packages');

function findPackageSrcs() {
  if (!fs.existsSync(packagesDir)) return [];
  return fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(packagesDir, d.name, 'src'))
    .filter(p => fs.existsSync(p));
}

function walk(dir, cb) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === 'node_modules') continue;
      walk(full, cb);
    } else if (name.isFile() && full.endsWith('.ts')) {
      cb(full);
    }
  }
}

function updateFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;

  // Replace relative import/export specifiers without extensions
  // Matches '"./foo"' or '"../bar/baz"'
  src = src.replace(/(['"])(\.\.\/|\.\/)([^'"\)\n;]+?)\1/g, (m, q, prefix, spec) => {
    // Skip if it already has an extension or query/hash
    if (spec.includes('?') || spec.includes('#')) return m;
    if (/\.[a-zA-Z0-9]+$/.test(spec)) return m; // already has extension

    const fileDir = path.dirname(file);
    const candidateTs = path.resolve(fileDir, prefix + spec + '.ts');
    const candidateIndexTs = path.resolve(fileDir, prefix + spec, 'index.ts');

    if (fs.existsSync(candidateTs)) {
      return q + prefix + spec + '.js' + q;
    }
    if (fs.existsSync(candidateIndexTs)) {
      return q + prefix + spec + '/index.js' + q;
    }

    // Best-effort: append .js so output and runtime match
    return q + prefix + spec + '.js' + q;
  });

  if (src !== orig) {
    fs.writeFileSync(file, src, 'utf8');
    console.log('Patched imports in', file);
  }
}

const srcDirs = findPackageSrcs();
if (srcDirs.length === 0) {
  console.error('No package src directories found. Run from repo root.');
  process.exit(1);
}

for (const dir of srcDirs) {
  walk(dir, updateFile);
}

console.log('Source import specifier rewrite complete.');
