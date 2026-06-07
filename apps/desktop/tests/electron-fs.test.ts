import { writeFileSync } from '../src/renderer/src/electron-fs';

describe('electron-fs', () => {
  it('forwards writes to the preload bridge', () => {
    const writeBridge = jest.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        writeFileSync: writeBridge,
      },
    });

    const payload = new Uint8Array([1, 2, 3]);
    writeFileSync('/tmp/example.uge', payload);

    expect(writeBridge).toHaveBeenCalledWith('/tmp/example.uge', payload);
  });
});
