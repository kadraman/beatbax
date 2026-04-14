const fs = require('fs');
const path = require('path');

// This script links all local BeatBax plugins (e.g., plugin-chip-nes) into the web-ui's node_modules for local development.
// Usage: node scripts/link-local-plugins.cjs

const repoRoot = path.resolve(__dirname, '..');
const pluginsDir = path.join(repoRoot, 'packages', 'plugins');
const webUiNodeModules = path.join(repoRoot, 'apps', 'web-ui', 'node_modules', '@beatbax');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

try {
  if (!fs.existsSync(pluginsDir)) throw new Error('Plugins directory not found: ' + pluginsDir);
  fs.mkdirSync(webUiNodeModules, { recursive: true });

  for (const pluginName of fs.readdirSync(pluginsDir)) {
    const pluginPath = path.join(pluginsDir, pluginName);
    const stat = fs.statSync(pluginPath);
    if (!stat.isDirectory()) continue;
    const distDir = path.join(pluginPath, 'dist');
    if (!fs.existsSync(distDir)) {
      console.warn(`Skipping ${pluginName}: dist/ not found.`);
      continue;
    }
    const targetDir = path.join(webUiNodeModules, pluginName);
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
    copyDir(distDir, path.join(targetDir, 'dist'));
    // Copy minimal package.json
    const pkgJsonPath = path.join(pluginPath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = require(pkgJsonPath);
      const minimalPkg = {
        name: pkg.name,
        version: pkg.version,
        type: pkg.type || 'module',
        main: pkg.main || 'dist/index.js',
        exports: pkg.exports || undefined,
      };
      fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(minimalPkg, null, 2), 'utf8');
    }
    console.log(`Linked local plugin: ${pluginName}`);
  }
  console.log('All local plugins linked into web-ui node_modules.');
} catch (err) {
  console.error('Failed to link local plugins:', err);
  process.exit(1);
}
