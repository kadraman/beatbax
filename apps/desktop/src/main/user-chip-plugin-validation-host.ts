/**
 * Resolve browser ESM that installs real `@beatbax/engine` host namespaces
 * for sandboxed install-time validation (spec 111).
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { VALIDATION_ENGINE_HOST_SOURCE } from './generated/validation-engine-host-source';
import {
  buildValidationEngineHostSource,
  findExistingValidationEngineHostFile,
} from './user-chip-plugin-validation-host-build';

let cachedSource: string | null =
  typeof VALIDATION_ENGINE_HOST_SOURCE === 'string' && VALIDATION_ENGINE_HOST_SOURCE.length > 0
    ? VALIDATION_ENGINE_HOST_SOURCE
    : null;

function readPackedHostSource(): string | null {
  const existing = findExistingValidationEngineHostFile();
  if (existing) return readFileSync(existing, 'utf8');
  try {
    // Lazy: only resolve app path when running inside Electron.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron');
    const fromApp = path.join(app.getAppPath(), 'resources/validation-engine-host.js');
    if (existsSync(fromApp)) return readFileSync(fromApp, 'utf8');
  } catch {
    // Jest / non-Electron loaders may not expose app paths.
  }
  return null;
}

export async function getValidationEngineHostSource(): Promise<string> {
  if (cachedSource) return cachedSource;
  const packed = readPackedHostSource();
  if (packed) {
    cachedSource = packed;
    return cachedSource;
  }
  // Last resort — prefer ensureValidationEngineHostFile() from the Jest parent
  // so Electron's main process never blocks on esbuild during a protocol request.
  cachedSource = await buildValidationEngineHostSource();
  return cachedSource;
}
