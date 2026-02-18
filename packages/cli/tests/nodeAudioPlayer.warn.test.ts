describe('nodeAudioPlayer warnings', () => {
  test('emits Windows downmix warning when using PowerShell fallback', async () => {
    // Create mock logger BEFORE any modules load
    const mockLogger = { 
      warn: jest.fn(), 
      info: jest.fn(), 
      debug: jest.fn(), 
      error: jest.fn() 
    };

    // Clear module cache so we can mock dynamic imports used by playAudioBuffer
    jest.resetModules();

    // Mock the logger module BEFORE loading nodeAudioPlayer
    jest.mock('@beatbax/engine/util/logger', () => ({
      createLogger: jest.fn(() => mockLogger),
      configureLogging: jest.fn(),
    }));

    // Mock speaker and play-sound to simulate they are NOT installed
    jest.mock('speaker', () => { throw new Error('no speaker'); }, { virtual: true });
    jest.mock('play-sound', () => { throw new Error('no play-sound'); }, { virtual: true });

    // Now import the module under test after applying mocks
    const { playAudioBuffer } = require('../src/nodeAudioPlayer');

    // Temporarily force platform to win32
    const origPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    // @ts-ignore
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const samples = new Float32Array(44100 * 1 * 2); // 1 second stereo silence
    
    // Replace spawn to a fake that immediately closes (simulate PowerShell playback)
    const childProcess = require('child_process');
    const origSpawn = childProcess.spawn;
    jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
      return { on: (e: string, cb: any) => { if (e === 'close') setTimeout(() => cb(0), 10); } } as any;
    });

    try {
      await playAudioBuffer(samples, { channels: 2, sampleRate: 44100 });
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('may downmix'));
    } finally {
      // restore spawn
      childProcess.spawn = origSpawn;
      if (origPlatform) Object.defineProperty(process, 'platform', origPlatform);
      jest.resetModules();
      jest.unmock('@beatbax/engine/util/logger');
    }
  }, 20000);
});
