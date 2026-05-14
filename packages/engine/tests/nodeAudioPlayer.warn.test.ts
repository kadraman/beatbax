describe('nodeAudioPlayer warnings', () => {
  test('emits Windows downmix warning when using PowerShell fallback', async () => {
    const mockLogger = {
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };

    // Clear module cache so we can mock dynamic imports used by playAudioBuffer
    jest.resetModules();

    // Mock logger before loading nodeAudioPlayer module
    jest.mock('../src/util/logger', () => ({
      createLogger: jest.fn(() => mockLogger),
      configureLogging: jest.fn(),
    }));

    // Force fallthrough to system command path
    jest.mock('speaker', () => {
      throw new Error('no speaker');
    }, { virtual: true });
    jest.mock('play-sound', () => {
      throw new Error('no play-sound');
    }, { virtual: true });

    const { playAudioBuffer } = require('../src/node/nodeAudioPlayer');

    const origPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const samples = new Float32Array(44100 * 2);
    const childProcess = require('child_process');
    const origSpawn = childProcess.spawn;
    jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
      return {
        on: (event: string, cb: (code?: number) => void) => {
          if (event === 'close') setTimeout(() => cb(0), 10);
        }
      } as any;
    });

    try {
      await playAudioBuffer(samples, { channels: 2, sampleRate: 44100 });
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('may downmix'));
    } finally {
      childProcess.spawn = origSpawn;
      if (origPlatform) {
        Object.defineProperty(process, 'platform', origPlatform);
      }
      jest.resetModules();
      jest.unmock('../src/util/logger');
    }
  }, 20000);
});
