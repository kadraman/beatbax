/**
 * Browser-safe mock for Node.js 'fs' module.
 * Used via Vite alias to intercept writeFileSync calls from the engine's
 * export functions, capturing the output data for browser downloads.
 */

// Captured data from the last writeFileSync call
let _capturedData: Uint8Array | null = null;
let _capturedPath: string | null = null;

/**
 * Mock writeFileSync that captures data instead of writing to disk
 */
export function writeFileSync(path: string, data: any, _encoding?: string): void {
  if (data instanceof Uint8Array) {
    _capturedData = data;
  } else if (typeof Buffer !== 'undefined' && data instanceof Buffer) {
    _capturedData = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else if (data instanceof ArrayBuffer) {
    _capturedData = new Uint8Array(data);
  } else if (typeof data === 'string') {
    _capturedData = new TextEncoder().encode(data);
  } else {
    // Try to handle any other buffer-like object
    try {
      _capturedData = new Uint8Array(data);
    } catch {
      _capturedData = null;
    }
  }
  _capturedPath = path;
}

/**
 * Retrieve the last captured writeFileSync data
 */
export function getCapturedWrite(): { path: string; data: Uint8Array } | null {
  if (_capturedData !== null && _capturedPath !== null) {
    return { path: _capturedPath, data: _capturedData };
  }
  return null;
}

/**
 * Clear the captured data
 */
export function clearCapturedWrite(): void {
  _capturedData = null;
  _capturedPath = null;
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

// Default export for CJS interop
export default {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  statSync,
};
