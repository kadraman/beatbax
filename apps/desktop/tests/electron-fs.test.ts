import { existsSync, readFileSync, writeFileSync } from '../src/renderer/src/electron-fs';

describe('electron-fs', () => {
  it('forwards writes to the preload bridge', () => {
    const writeBridge = jest.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        writeFileSync: writeBridge,
        readFileSync: jest.fn(),
        existsSync: jest.fn(),
      },
    });

    const payload = new Uint8Array([1, 2, 3]);
    writeFileSync('/tmp/example.uge', payload);

    expect(writeBridge).toHaveBeenCalledWith('/tmp/example.uge', payload);
  });

  it('forwards readFileSync to the preload bridge', () => {
    const readBridge = jest.fn().mockReturnValue('inst foo\n');
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        writeFileSync: jest.fn(),
        readFileSync: readBridge,
        existsSync: jest.fn(),
      },
    });

    expect(readFileSync('C:\\music\\foo.ins', 'utf-8')).toBe('inst foo\n');
    expect(readBridge).toHaveBeenCalledWith('C:\\music\\foo.ins', 'utf-8');
  });

  it('forwards existsSync to the preload bridge', () => {
    const existsBridge = jest.fn().mockReturnValue(true);
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        writeFileSync: jest.fn(),
        readFileSync: jest.fn(),
        existsSync: existsBridge,
      },
    });

    expect(existsSync('C:\\music\\foo.ins')).toBe(true);
    expect(existsBridge).toHaveBeenCalledWith('C:\\music\\foo.ins');
  });
});
