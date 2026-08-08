/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Runs electron-builder, optionally enabling Azure Trusted Signing on Windows
 * when all required env vars are present (CI soft-fail when secrets are absent).
 */
const desktopRoot = path.resolve(__dirname, '..');
const builderCli = path.resolve(desktopRoot, '../../node_modules/electron-builder/cli.js');
const baseConfigPath = path.join(desktopRoot, 'electron-builder.yml');

function azureSigningConfigured() {
  return Boolean(
    process.env.AZURE_TENANT_ID &&
      process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.AZURE_TRUSTED_SIGNING_ENDPOINT &&
      process.env.AZURE_TRUSTED_SIGNING_ACCOUNT &&
      process.env.AZURE_TRUSTED_SIGNING_PROFILE &&
      process.env.AZURE_TRUSTED_SIGNING_PUBLISHER,
  );
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

const args = process.argv.slice(2);
if (args.length === 0) {
  args.push('--publish', 'never');
}

let tempDir = null;

try {
  if (process.platform === 'win32' && azureSigningConfigured()) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatbax-eb-azure-'));
    const azureConfigPath = path.join(tempDir, 'electron-builder.azure.yml');
    const config = [
      `extends: ${yamlString(baseConfigPath)}`,
      'win:',
      '  azureSignOptions:',
      `    endpoint: ${yamlString(process.env.AZURE_TRUSTED_SIGNING_ENDPOINT)}`,
      `    codeSigningAccountName: ${yamlString(process.env.AZURE_TRUSTED_SIGNING_ACCOUNT)}`,
      `    certificateProfileName: ${yamlString(process.env.AZURE_TRUSTED_SIGNING_PROFILE)}`,
      `    publisherName: ${yamlString(process.env.AZURE_TRUSTED_SIGNING_PUBLISHER)}`,
      '',
    ].join('\n');
    fs.writeFileSync(azureConfigPath, config, 'utf8');
    console.log('Azure Trusted Signing credentials detected; enabling Authenticode signing');
    args.unshift('--config', azureConfigPath);
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
