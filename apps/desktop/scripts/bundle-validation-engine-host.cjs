/**
 * Bundle the browser-safe engine host bridge for sandboxed plugin validation.
 * Writes:
 * - resources/validation-engine-host.js (packaged with the app)
 * - out/main/validation-engine-host.js when out/main exists (electron-vite output)
 */
const { build } = require('esbuild');
const { mkdirSync, writeFileSync, mkdtempSync, readFileSync, rmSync, existsSync, copyFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

async function main() {
  const desktopRoot = path.resolve(__dirname, '..');
  const entry = path.join(desktopRoot, 'src/main/user-chip-plugin-validation-host-entry.ts');
  const tmp = mkdtempSync(path.join(tmpdir(), 'bb-validation-host-'));
  const outfile = path.join(tmp, 'validation-engine-host.js');
  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      outfile,
      logLevel: 'silent',
      conditions: ['browser', 'module', 'import', 'default'],
      mainFields: ['browser', 'module', 'main'],
      alias: {
        fs: path.join(desktopRoot, 'src/main/user-chip-plugin-validation-fs-shim.ts'),
        path: path.join(desktopRoot, '../web-ui/src/utils/browser-path.ts'),
      },
    });
    const source = readFileSync(outfile, 'utf8');
    const resourcesDir = path.join(desktopRoot, 'resources');
    mkdirSync(resourcesDir, { recursive: true });
    const resourcePath = path.join(resourcesDir, 'validation-engine-host.js');
    writeFileSync(resourcePath, source, 'utf8');

    const outMain = path.join(desktopRoot, 'out/main');
    if (existsSync(outMain)) {
      copyFileSync(resourcePath, path.join(outMain, 'validation-engine-host.js'));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
