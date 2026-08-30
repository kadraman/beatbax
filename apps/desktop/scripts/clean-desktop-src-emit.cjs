/**
 * Remove co-located TypeScript emit (*.js, *.jsx, *.d.ts) from apps/desktop/src.
 * Source of truth is *.ts / *.tsx — these emits are gitignored and break dev when
 * tooling resolves them instead of the TypeScript sources.
 */
const fs = require('node:fs');
const path = require('node:path');

const srcRoot = path.join(__dirname, '..', 'src');
const allowlistedDts = new Set([
  path.normalize(path.join(srcRoot, 'preload', 'index.d.ts')),
  path.normalize(path.join(srcRoot, 'renderer', 'src', 'env.d.ts')),
]);

function walk(dir, removed) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, removed);
      continue;
    }
    const norm = path.normalize(full);
    if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) {
      fs.unlinkSync(full);
      removed.push(path.relative(srcRoot, full));
      continue;
    }
    if (entry.name.endsWith('.d.ts') && !allowlistedDts.has(norm)) {
      fs.unlinkSync(full);
      removed.push(path.relative(srcRoot, full));
    }
  }
}

if (!fs.existsSync(srcRoot)) {
  console.log('apps/desktop/src not found — nothing to clean');
  process.exit(0);
}

const removed = [];
walk(srcRoot, removed);
if (removed.length === 0) {
  console.log('No co-located TypeScript emit files in apps/desktop/src');
} else {
  console.log(`Removed ${removed.length} co-located emit file(s) from apps/desktop/src`);
}
