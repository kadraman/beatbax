const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const enginePkg = path.resolve(repoRoot, 'packages', 'engine');
const targetDir = path.join(repoRoot, 'node_modules', '@beatbax', 'engine');

try {
  const srcDist = path.join(enginePkg, 'dist');
  if (!fs.existsSync(srcDist)) {
    throw new Error(
      'Engine dist not found: ' + srcDist + '\nRun: npm run engine:build',
    );
  }

  fs.mkdirSync(path.join(repoRoot, 'node_modules', '@beatbax'), { recursive: true });
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  // Symlink the workspace package so `tsc --watch` updates are visible immediately.
  // (A dist-only copy goes stale as soon as the engine rebuilds during `web-ui:dev`.)
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(enginePkg, targetDir, linkType);

  console.log(`Linked @beatbax/engine -> ${enginePkg} (${linkType})`);
} catch (err) {
  console.error('Failed to link local @beatbax/engine:', err);
  process.exit(1);
}
