describe('nodeAudioPlayer warnings', () => {
  function createMockLogger() {
    return {
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };
  }

  function mockLoggerModule(mockLogger: ReturnType<typeof createMockLogger>) {
    jest.mock('../src/util/logger', () => ({
      createLogger: jest.fn(() => mockLogger),
      configureLogging: jest.fn(),
    }));
  }

  function mockSuccessfulSpawn() {
    const childProcess = require('child_process');
    const origSpawn = childProcess.spawn;
    jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
      return {
        on: (event: string, cb: (code?: number) => void) => {
          if (event === 'close') setTimeout(() => cb(0), 10);
        }
      } as any;
    });
    return { childProcess, origSpawn };
  }

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    jest.unmock('../src/util/logger');
  });

  test('emits Windows downmix warning when using PowerShell fallback', async () => {
    const mockLogger = createMockLogger();

    jest.resetModules();
    mockLoggerModule(mockLogger);

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
    const { childProcess, origSpawn } = mockSuccessfulSpawn();

    try {
      await playAudioBuffer(samples, { channels: 2, sampleRate: 44100 });
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('may downmix'));
    } finally {
      childProcess.spawn = origSpawn;
      if (origPlatform) {
        Object.defineProperty(process, 'platform', origPlatform);
      }
    }
  }, 20000);

  test('logs fallback failure reasons before continuing to the next player', async () => {
    const mockLogger = createMockLogger();

    jest.resetModules();
    mockLoggerModule(mockLogger);

    jest.mock('speaker', () => class SpeakerMock {
      private handlers = new Map<string, Array<(...args: any[]) => void>>();

      on(event: string, cb: (...args: any[]) => void) {
        const handlers = this.handlers.get(event) ?? [];
        handlers.push(cb);
        this.handlers.set(event, handlers);
        return this;
      }

      once(event: string, cb: (...args: any[]) => void) {
        return this.on(event, cb);
      }

      write() {
        const errorHandlers = this.handlers.get('error') ?? [];
        setTimeout(() => {
          for (const handler of errorHandlers) handler(new Error('speaker device busy'));
        }, 0);
        return true;
      }

      end() {
        return this;
      }
    }, { virtual: true });

    jest.mock('play-sound', () => () => ({
      play: (_file: string, cb: (err: Error | null) => void) => cb(new Error('play-sound backend missing')),
    }), { virtual: true });

    const { playAudioBuffer } = require('../src/node/nodeAudioPlayer');

    const origPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const samples = new Float32Array(44100 * 2);
    const { childProcess, origSpawn } = mockSuccessfulSpawn();

    try {
      await playAudioBuffer(samples, { channels: 2, sampleRate: 44100 });
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('speaker audio playback failed: speaker device busy. Trying play-sound...'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('play-sound audio playback failed: play-sound backend missing. Trying system audio player...'));
      expect(mockLogger.debug).toHaveBeenCalledWith('speaker audio playback error:', expect.any(Error));
      expect(mockLogger.debug).toHaveBeenCalledWith('play-sound audio playback error:', expect.any(Error));
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('may downmix'));
    } finally {
      childProcess.spawn = origSpawn;
      if (origPlatform) {
        Object.defineProperty(process, 'platform', origPlatform);
      }
    }
  }, 20000);
});
