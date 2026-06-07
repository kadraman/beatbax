/**
 * Browser-safe mock for Node.js 'fs' module.
 * Used via Vite alias to intercept writeFileSync calls from the engine's
 * export functions, capturing the output data for browser downloads.
 */

import {
  captureWrite,
  getCapturedWrite,
  clearCapturedWrite,
} from '@beatbax/app-core/io/write-capture';

export { getCapturedWrite, clearCapturedWrite };

/**
 * Mock writeFileSync that captures data instead of writing to disk
 */
export function writeFileSync(path: string, data: unknown, _encoding?: string): void {
  captureWrite(path, data);
}

// Stub out other fs functions to prevent errors
export function readFileSync(): never {
  throw new Error('readFileSync is not available in browser context');
}

export function existsSync(): boolean {
  return false;
}

export function mkdirSync(): void {
  // no-op
}

export function statSync(): never {
  throw new Error('statSync is not available in browser context');
}

export default {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  statSync,
  getCapturedWrite,
  clearCapturedWrite,
};
