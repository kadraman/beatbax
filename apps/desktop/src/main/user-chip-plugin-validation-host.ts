/**
 * Resolve browser ESM that installs real `@beatbax/engine` host namespaces
 * for sandboxed install-time validation (spec 111).
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { VALIDATION_ENGINE_HOST_SOURCE } from './generated/validation-engine-host-source';

let cachedSource: string | null =
  typeof VALIDATION_ENGINE_HOST_SOURCE === 'string' && VALIDATION_ENGINE_HOST_SOURCE.length > 0
    ? VALIDATION_ENGINE_HOST_SOURCE
    : null;

function desktopSrcMainDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'src/main'),
    path.resolve(process.cwd(), 'apps/desktop/src/main'),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'user-chip-plugin-validation-host-entry.ts'))) {
      return candidate;
    }
  }
  throw new Error('Cannot find apps/desktop/src/main (validation host entry).');
}

function validationHostEntry(): string {
  return path.join(desktopSrcMainDir(), 'user-chip-plugin-validation-host-entry.ts');
}

function packedHostCandidates(): string[] {
  let desktopRoot: string | null = null;
  try {
    desktopRoot = path.resolve(desktopSrcMainDir(), '../..');
  } catch {
    desktopRoot = null;
  }
  const fromApp: string[] = [];
  try {
    fromApp.push(path.join(app.getAppPath(), 'resources/validation-engine-host.js'));
  } catch {
    // Jest / non-Electron loaders may not expose app paths.
  }
  return [
    ...fromApp,
    desktopRoot ? path.join(desktopRoot, 'resources/validation-engine-host.js') : '',
    path.resolve(process.cwd(), 'resources/validation-engine-host.js'),
    path.resolve(process.cwd(), 'apps/desktop/resources/validation-engine-host.js'),
    path.resolve(process.cwd(), 'out/main/validation-engine-host.js'),
    path.resolve(process.cwd(), 'apps/desktop/out/main/validation-engine-host.js'),
  ].filter(Boolean);
}

function readPackedHostSource(): string | null {
  for (const candidate of packedHostCandidates()) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, 'utf8');
    }
  }
  return null;
}

function desktopRootFromEntry(entry: string): string {
  return path.resolve(path.dirname(entry), '../..');
}

async function buildValidationEngineHostSource(): Promise<string> {
  const esbuild = await import('esbuild');
  const entry = validationHostEntry();
  const desktopRoot = desktopRootFromEntry(entry);
  const tmp = mkdtempSync(path.join(tmpdir(), 'bb-validation-host-'));
  const outfile = path.join(tmp, 'validation-engine-host.js');
  try {
    await esbuild.build({
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
    return readFileSync(outfile, 'utf8');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function getValidationEngineHostSource(): Promise<string> {
  if (cachedSource) return cachedSource;
  const packed = readPackedHostSource();
  if (packed) {
    cachedSource = packed;
    return cachedSource;
  }
  cachedSource = await buildValidationEngineHostSource();
  return cachedSource;
}
