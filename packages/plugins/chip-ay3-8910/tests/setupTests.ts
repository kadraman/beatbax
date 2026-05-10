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
    };
  }

  createGain() {
    return {
      gain: { value: 0, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() },
      connect: jest.fn(),
    };
  }
}

(global as any).AudioContext = MockAudioContext as any;
(global as any).BaseAudioContext = MockAudioContext as any;
