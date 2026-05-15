// Browser-safe mock for Node.js 'fs' used by externalized engine modules.

let capturedData = null;
let capturedPath = null;

export function writeFileSync(path, data, _encoding) {
  if (data instanceof Uint8Array) {
    capturedData = data;
  } else if (typeof Buffer !== 'undefined' && data instanceof Buffer) {
    capturedData = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else if (data instanceof ArrayBuffer) {
    capturedData = new Uint8Array(data);
  } else if (typeof data === 'string') {
    capturedData = new TextEncoder().encode(data);
  } else {
    try {
      capturedData = new Uint8Array(data);
    } catch {
      capturedData = null;
    }
  }
  capturedPath = path;
}

export function getCapturedWrite() {
  if (capturedData !== null && capturedPath !== null) {
    return { path: capturedPath, data: capturedData };
  }
  return null;
}

export function clearCapturedWrite() {
  capturedData = null;
  capturedPath = null;
}

export function readFileSync() {
  throw new Error('readFileSync is not available in browser context');
}

export function existsSync() {
  return false;
}

export function mkdirSync() {
}

export function statSync() {
  throw new Error('statSync is not available in browser context');
}

export function unlinkSync() {
}

export function rmSync() {
}

export default {
  writeFileSync,
  getCapturedWrite,
  clearCapturedWrite,
  readFileSync,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  rmSync,
};
