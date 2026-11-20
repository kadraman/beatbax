/**
 * Browser fs stub for the sandboxed validation engine-host bundle.
 * Validation windows have no preload / electronAPI; engine file I/O is unused
 * during ChipPlugin shape checks.
 */

function unavailable(method: string): never {
  throw new Error(`${method} is not available during sandboxed plugin validation.`);
}

export function writeFileSync(): never {
  return unavailable('writeFileSync');
}

export function readFileSync(): never {
  return unavailable('readFileSync');
}

export function existsSync(): boolean {
  return false;
}

export function mkdirSync(): void {
  // no-op
}

export function statSync(): never {
  return unavailable('statSync');
}

export default {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  statSync,
};
