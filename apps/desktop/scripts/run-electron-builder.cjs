/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  azureSigningConfigured,
  buildElectronBuilderOverlay,
  needsBuilderOverlay,
  resolveDesktopReleaseIdentity,
} = require('./desktop-release-lib.cjs');

/**
 * Runs electron-builder, optionally enabling Azure Trusted Signing on Windows
 * when all required env vars are present (CI soft-fail when secrets are absent).
 * Development releases stamp extraMetadata.version and BeatBax-dev-* artifact names.
 */
const desktopRoot = path.resolve(__dirname, '..');
const builderCli = path.resolve(desktopRoot, '../../node_modules/electron-builder/cli.js');
const baseConfigPath = path.join(desktopRoot, 'electron-builder.yml');
const pkg = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'));

const args = process.argv.slice(2);
if (args.length === 0) {
  args.push('--publish', 'never');
}

const identity = resolveDesktopReleaseIdentity({ pkg, env: process.env });
const azure = process.platform === 'win32' && azureSigningConfigured(process.env);
const overlayNeeded = needsBuilderOverlay({
  version: identity.version,
  pkgVersion: pkg.version,
  devRelease: identity.dev,
  azure,
});

let tempDir = null;

try {
  if (overlayNeeded) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatbax-eb-'));
    const overlayPath = path.join(tempDir, 'electron-builder.overlay.yml');
    const overlay = buildElectronBuilderOverlay({
      baseConfigPath,
      version: identity.version,
      devRelease: identity.dev,
      azure,
      env: process.env,
    });
    fs.writeFileSync(overlayPath, overlay, 'utf8');
    if (azure) {
      console.log('Azure Trusted Signing credentials detected; enabling Authenticode signing');
    }
    if (identity.dev) {
      console.log(`Development release overlay: version=${identity.version} artifacts=BeatBax-dev-*`);
    } else if (identity.version !== pkg.version) {
      console.log(`Version overlay: ${identity.version}`);
    }
    args.unshift('--config', overlayPath);
  } else if (process.platform === 'win32') {
    console.log('Azure Trusted Signing credentials not configured; building unsigned Windows artifacts');
  }

  const result = spawnSync(process.execPath, [builderCli, ...args], {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
} finally {
  if (tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
}
