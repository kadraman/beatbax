#!/usr/bin/env node
/*
  Codemod (CommonJS): ins-csv-to-object.cjs
  This is the CommonJS copy of ins-csv-to-object.js for repositories using
  "type": "module" in package.json. Run with: `node scripts/ins-csv-to-object.cjs`
*/
const fs = require('fs');
const path = require('path');

function walkDir(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
      walkDir(full, out);
    } else if (e.isFile() && full.endsWith('.bax')) {
      out.push(full);
    }
  }
  return out;
}

function findFiles(paths) {
  if (!paths || paths.length === 0) return walkDir(process.cwd());
  const out = [];
  for (const p of paths) {
    const full = path.resolve(p);
    if (!fs.existsSync(full)) continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walkDir(full, out);
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out.filter(Boolean);
}

function envReplace(val, vendorParam) {
  if (!val || val.startsWith('{')) return null;
  if (val.indexOf(',') === -1) return null;
  let s = String(val).trim();
  // support optional vendor prefix like 'gb:' and keep it as a format field
  let vendor = vendorParam || null;
  const prefixMatch = s.match(/^([a-z]+):/i);
  if (prefixMatch) {
    vendor = String(prefixMatch[1]).toLowerCase();
    s = s.replace(/^[a-z]+:/i, '');
  }
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  // guard: first part must be numeric (avoid replacing comment placeholders)
  if (!parts[0] || !/^\d+$/.test(parts[0])) return null;
  const level = parseInt(parts[0], 10);
  const dir = parts[1] ? parts[1].toLowerCase() : 'none';
  const period = parts[2] ? parseInt(parts[2], 10) : 0;
  const direction = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'none';
  const out = { level: Math.max(0, Math.min(15, Number.isNaN(level) ? 0 : level)), direction, period: Math.max(0, Number.isNaN(period) ? 0 : period) };
  if (vendor) out.format = vendor;
  return JSON.stringify(out);
}

function sweepReplace(val, vendorParam) {
  if (!val || val.startsWith('{')) return null;
  if (val.indexOf(',') === -1) return null;
  let s = String(val).trim();
  let vendor = vendorParam || null;
  const prefixMatch = s.match(/^([a-z]+):/i);
  if (prefixMatch) {
    vendor = String(prefixMatch[1]).toLowerCase();
    s = s.replace(/^[a-z]+:/i, '');
  }
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  if (!parts[0] || !/^\d+$/.test(parts[0])) return null;
  const time = parseInt(parts[0], 10);
  const dir = parts[1] ? parts[1].toLowerCase() : 'none';
  const shift = parts[2] ? parseInt(parts[2], 10) : 0;
  const direction = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'none';
  const out = { time: Math.max(0, Number.isNaN(time) ? 0 : time), direction, shift: Math.max(0, Number.isNaN(shift) ? 0 : shift) };
  if (vendor) out.format = vendor;
  return JSON.stringify(out);
}

function noiseReplace(val, vendorParam) {
  if (!val || val.startsWith('{')) return null;
  if (val.indexOf(',') === -1) return null;
  let s = String(val).trim();
  let vendor = vendorParam || null;
  const prefixMatch = s.match(/^([a-z]+):/i);
  if (prefixMatch) {
    vendor = String(prefixMatch[1]).toLowerCase();
    s = s.replace(/^[a-z]+:/i, '');
  }
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  if (!parts[0] || !/^\d+$/.test(parts[0])) return null;
  const clockShift = parseInt(parts[0], 10);
  const widthMode = parts[1] ? (parts[1] === '7' ? 7 : parts[1] === '15' ? 15 : undefined) : undefined;
  const divisor = parts[2] ? parseInt(parts[2], 10) : undefined;
  const out = {};
  if (!Number.isNaN(clockShift)) out.clockShift = clockShift;
  if (widthMode) out.widthMode = widthMode;
  if (!Number.isNaN(divisor)) out.divisor = divisor;
  if (vendor) out.format = vendor;
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

function widthReplace(val, vendorParam) {
  if (!val) return null;
  let s = String(val).trim();
  // vendor can be on value or provided by the key (vendorParam)
  let vendor = vendorParam || null;
  const prefixMatch = s.match(/^([a-z]+):/i);
  if (prefixMatch) {
    vendor = String(prefixMatch[1]).toLowerCase();
    s = s.replace(/^[a-z]+:/i, '');
  }
  // if value is already an object literal, skip
  if (s.startsWith('{')) return null;
  // must be numeric
  if (!/^-?\d+$/.test(s)) return null;
  const valNum = parseInt(s, 10);
  if (vendor) return JSON.stringify({ value: valNum, format: vendor });
  return null;
}

function transformContent(src) {
  // Replace env=..., sweep=..., noise=... occurrences (not inside object literals)
  // match optional vendor prefix on the key (e.g. gb:width) and include `width`
  const re = /(\b(?:[a-z]+:)?(env|sweep|noise|width))=({[^}]*}|[^\s#]+)/g;
  let changed = false;
  const res = src.replace(re, (match, key, which, val) => {
    const rawVal = val;
    // detect vendor prefix on key (e.g. gb:width)
    let vendorFromKey = null;
    const keyMatch = String(key).match(/^([a-z]+):(env|sweep|noise|width)$/i);
    if (keyMatch) vendorFromKey = String(keyMatch[1]).toLowerCase();
    let replacement = null;
    try {
      if (which === 'env') replacement = envReplace(rawVal);
      else if (which === 'sweep') replacement = sweepReplace(rawVal);
      else if (which === 'noise') replacement = noiseReplace(rawVal, vendorFromKey);
      else if (which === 'width') replacement = widthReplace(rawVal, vendorFromKey);
    } catch (e) {
      replacement = null;
    }
    if (replacement) {
      changed = true;
      return `${key}=${replacement}`;
    }
    return match;
  });
  return { content: res, changed };
}

function simpleDiff(a, b) {
  const la = a.split(/\r?\n/);
  const lb = b.split(/\r?\n/);
  const out = [];
  const max = Math.max(la.length, lb.length);
  for (let i = 0; i < max; i++) {
    const A = la[i] ?? '';
    const B = lb[i] ?? '';
    if (A === B) {
      out.push(' ' + A);
    } else {
      if (A !== undefined) out.push('-' + A);
      if (B !== undefined) out.push('+' + B);
    }
  }
  return out.join('\n');
}

function run(argv) {
  const args = argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = !apply && args.includes('--dry-run') || !args.includes('--apply');
  const paths = args.filter(a => a !== '--apply' && a !== '--dry-run');
  const files = findFiles(paths);
  if (files.length === 0) {
    console.error('No .bax files found to process. Provide paths or run in a directory with .bax files.');
    process.exit(1);
  }
  let modifiedCount = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const { content, changed } = transformContent(src);
    if (changed) {
      modifiedCount++;
      if (dryRun) {
        console.log(`---- ${f} (would change)`);
        console.log(simpleDiff(src, content));
        console.log('');
      } else if (apply) {
        fs.writeFileSync(f, content, 'utf8');
        console.log(`Updated ${f}`);
      }
    }
  }
  console.log(`Processed ${files.length} files. Modified: ${modifiedCount}`);
}

if (require.main === module) run(process.argv);
