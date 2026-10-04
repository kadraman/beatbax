/**
 * Remove co-located TypeScript emit from apps/desktop:
 *   - *.js, *.jsx, *.d.ts under src/ and tests/ (except tracked files below)
 *   - electron.vite.config.js / .d.ts (electron-vite loads .js before .ts)
 *   - tsconfig.*.tsbuildinfo
 * Source of truth is *.ts / *.tsx. These emits are gitignored, but tooling
 * resolves them instead of the TypeScript sources (Playwright runs stale
 * *.spec.js copies; electron-vite builds with a stale config).
 */
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.join(__dirname, '..');
const keep = new Set([
  path.join(desktopRoot, 'src', 'preload', 'index.d.ts'),
  path.join(desktopRoot, 'src', 'renderer', 'src', 'env.d.ts'),
  path.join(desktopRoot, 'tests', 'test-types.d.ts'),
  path.join(desktopRoot, 'tests', '__mocks__', 'styleMock.js'),
].map((file) => path.normalize(file)));

function isEmit(name) {
  return name.endsWith('.js') || name.endsWith('.jsx') || name.endsWith('.d.ts');
}

function walk(dir, removed) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, removed);
      continue;
    }
    if (isEmit(entry.name) && !keep.has(path.normalize(full))) {
      fs.unlinkSync(full);
      removed.push(path.relative(desktopRoot, full));
    }
  }
}

const removed = [];
walk(path.join(desktopRoot, 'src'), removed);
walk(path.join(desktopRoot, 'tests'), removed);

for (const name of fs.readdirSync(desktopRoot)) {
  if (/^electron\.vite\.config\.(js|d\.ts)$/.test(name) || /^tsconfig\..+\.tsbuildinfo$/.test(name)) {
    fs.unlinkSync(path.join(desktopRoot, name));
    removed.push(name);
  }
}

if (removed.length === 0) {
  console.log('No co-located TypeScript emit files in apps/desktop');
} else {
  console.log(`Removed ${removed.length} co-located emit file(s) from apps/desktop`);
}
