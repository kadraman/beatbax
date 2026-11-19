/**
 * Build the browser ESM engine-host bundle used by sandboxed plugin validation.
 * Safe to call from Jest/Node (no Electron imports).
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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

function desktopRootFromEntry(entry: string): string {
  return path.resolve(path.dirname(entry), '../..');
}

/** Known on-disk locations for a prebuilt validation host bundle. */
export function validationEngineHostFileCandidates(): string[] {
  let desktopRoot: string | null = null;
  try {
    desktopRoot = path.resolve(desktopSrcMainDir(), '../..');
  } catch {
    desktopRoot = null;
  }
  return [
    process.env.BEATBAX_VALIDATION_ENGINE_HOST || '',
    desktopRoot ? path.join(desktopRoot, 'resources/validation-engine-host.js') : '',
    path.resolve(process.cwd(), 'resources/validation-engine-host.js'),
    path.resolve(process.cwd(), 'apps/desktop/resources/validation-engine-host.js'),
    path.resolve(process.cwd(), 'out/main/validation-engine-host.js'),
    path.resolve(process.cwd(), 'apps/desktop/out/main/validation-engine-host.js'),
  ].filter(Boolean);
}

export function findExistingValidationEngineHostFile(): string | null {
  for (const candidate of validationEngineHostFileCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Build the host bundle and return its absolute path (stable tmp or resources). */
export async function ensureValidationEngineHostFile(): Promise<string> {
  const existing = findExistingValidationEngineHostFile();
  if (existing) return existing;

  const esbuild = await import('esbuild');
  const entry = validationHostEntry();
  const desktopRoot = desktopRootFromEntry(entry);
  const resourcesDir = path.join(desktopRoot, 'resources');
  mkdirSync(resourcesDir, { recursive: true });
  const outfile = path.join(resourcesDir, 'validation-engine-host.js');
  const tmp = mkdtempSync(path.join(tmpdir(), 'bb-validation-host-'));
  const tmpOut = path.join(tmp, 'validation-engine-host.js');
  try {
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      outfile: tmpOut,
      logLevel: 'silent',
      conditions: ['browser', 'module', 'import', 'default'],
      mainFields: ['browser', 'module', 'main'],
      alias: {
        fs: path.join(desktopRoot, 'src/main/user-chip-plugin-validation-fs-shim.ts'),
        path: path.join(desktopRoot, '../web-ui/src/utils/browser-path.ts'),
      },
    });
    writeFileSync(outfile, readFileSync(tmpOut));
    return outfile;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function buildValidationEngineHostSource(): Promise<string> {
  const file = await ensureValidationEngineHostFile();
  return readFileSync(file, 'utf8');
}
