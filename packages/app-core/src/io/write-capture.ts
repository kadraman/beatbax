let _capturedData: Uint8Array | null = null;
let _capturedPath: string | null = null;

export function captureWrite(path: string, data: unknown): void {
  if (data instanceof Uint8Array) {
    _capturedData = data;
  } else if (typeof Buffer !== 'undefined' && data instanceof Buffer) {
    _capturedData = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else if (data instanceof ArrayBuffer) {
    _capturedData = new Uint8Array(data);
  } else if (typeof data === 'string') {
    _capturedData = new TextEncoder().encode(data);
  } else {
    try {
      _capturedData = new Uint8Array(data as ArrayBuffer);
    } catch {
      _capturedData = null;
    }
  }
  _capturedPath = path;
}

export function getCapturedWrite(): { path: string; data: Uint8Array } | null {
  if (_capturedData !== null && _capturedPath !== null) {
    return { path: _capturedPath, data: _capturedData };
  }
  return null;
}

export function clearCapturedWrite(): void {
  _capturedData = null;
  _capturedPath = null;
}
