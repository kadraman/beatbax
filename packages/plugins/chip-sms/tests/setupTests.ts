/**
 * Jest test setup for @beatbax/plugin-chip-sms.
 * Mirrors the NES plugin setup.
 */

// Mock AudioContext for tests
class MockAudioContext {
  sampleRate = 44100;
  currentTime = 0;
  destination: any = {};

  createOscillator() {
    return {
      type: 'square',
      frequency: { value: 0, setValueAtTime: jest.fn() },
      start: jest.fn(),
      stop: jest.fn(),
      connect: jest.fn(),
      setPeriodicWave: jest.fn(),
    };
  }

  createGain() {
    return {
      gain: { value: 0, setValueAtTime: jest.fn(), setValueCurveAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() },
      connect: jest.fn(),
    };
  }

  createBufferSource() {
    return {
      buffer: null,
      start: jest.fn(),
      stop: jest.fn(),
      connect: jest.fn(),
    };
  }

  createBuffer(_channels: number, _length: number, _sampleRate: number) {
    return {
      sampleRate: this.sampleRate,
      length: 0,
      getChannelData: () => new Float32Array(),
    };
  }

  createPeriodicWave(_real: Float32Array, _imag: Float32Array, _constraints: any) {
    return {};
  }
}

(global as any).AudioContext = MockAudioContext as any;
(global as any).BaseAudioContext = MockAudioContext as any;

// Suppress console warnings during tests
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

beforeEach(() => {
  jest.clearAllMocks();
});
