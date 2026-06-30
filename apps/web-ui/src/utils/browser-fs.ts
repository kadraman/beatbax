/**
 * Browser-safe mock for Node.js 'fs' module.
 * Retained as a Vite alias stub for any engine code that still imports 'fs'.
 */

export function writeFileSync(_path: string, _data: unknown, _encoding?: string): void {
  throw new Error('writeFileSync is not available in browser context — use payload-returning exporters instead');
}

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
};
