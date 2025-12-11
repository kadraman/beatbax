const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const enginePkg = path.join(repoRoot, 'packages', 'engine');

try {
  // Ensure a clean install: remove any previously installed package
  const installedDir = path.join(repoRoot, 'node_modules', '@beatbax', 'engine');
  if (fs.existsSync(installedDir)) {
    fs.rmSync(installedDir, { recursive: true, force: true });
  }

  // Directly copy the engine package `dist` into `node_modules/@beatbax/engine`.
  // This avoids running `npm pack` and is simpler and more robust in CI/dev.
  console.log('Copying @beatbax/engine dist into node_modules...');
  const targetDir = path.join(repoRoot, 'node_modules', '@beatbax', 'engine');
  fs.mkdirSync(path.join(repoRoot, 'node_modules', '@beatbax'), { recursive: true });
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });

  const srcDist = path.join(enginePkg, 'dist');
  if (!fs.existsSync(srcDist)) throw new Error('Engine dist not found: ' + srcDist);

  // simple recursive copy
  (function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      const s = path.join(src, name);
      const d = path.join(dest, name);
      const st = fs.statSync(s);
      if (st.isDirectory()) copyDir(s, d);
      else fs.copyFileSync(s, d);
    }
  })(srcDist, path.join(targetDir, 'dist'));

  // Copy a minimal package.json so node resolution and require() work as if installed
  const enginePkgJson = require(path.join(enginePkg, 'package.json'));
  const minimalPkg = {
    name: enginePkgJson.name,
    version: enginePkgJson.version,
    type: enginePkgJson.type || 'module',
    main: enginePkgJson.main || 'dist/index.js',
    exports: enginePkgJson.exports || undefined,
  };
  fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(minimalPkg, null, 2), 'utf8');

  console.log('Copied local @beatbax/engine into node_modules');
} catch (err) {
  console.error('Failed to install local engine package via npm pack/install:', err);
  process.exit(1);
}
// Post-processing and writer-copy steps were removed.
// The full UGE writer is now included in the `packages/engine` source, so
// `npm pack` produces a tarball that already contains the real writer and
// correct compiled files. Keeping the pack/install steps above ensures a
// realistic installed package in `node_modules` for integration tests.
//
// If you still need the post-processing for older workflows, reintroduce it
// here; otherwise this script avoids editing installed package files.

// No post-install import patching performed here. We now rewrite source
// TypeScript imports to include explicit `.js` extensions during the
// top-level build via `scripts/add-js-extensions.cjs`, so compiled outputs
// already contain correct specifiers for Node's ESM loader. If you need
// the older behavior, restore the patching logic above.
