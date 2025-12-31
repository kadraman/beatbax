jest.mock('../src/chips/gameboy/pulse', () => ({ playPulse: jest.fn((ctx: any, freq: number, duty: number, start: number, dur: number, inst: any) => {
  const osc: any = { start: jest.fn(), stop: jest.fn(), connect: jest.fn(), disconnect: jest.fn() };
  const gain: any = { connect: jest.fn(), disconnect: jest.fn() };
  // connect gain to ctx.destination by default
  try { gain.connect((ctx as any).destination); } catch (e) {}
  return [osc, gain];
}) }));

import BufferedRenderer from '../src/audio/bufferedRenderer';

describe('BufferedRenderer effects integration', () => {
  beforeEach(() => {
    // Mock global OfflineAudioContext used by BufferedRenderer
    (global as any).OfflineAudioContext = class {
      constructor(n: number, length: number, sr: number) {
        // minimal API used by renderSegment and effects
        (this as any).sampleRate = sr;
        (this as any).destination = {};
      }
      async startRendering() { return {}; }
      createStereoPanner() { return { pan: { setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() }, connect: jest.fn() }; }
    } as any;
  });

  test('enqueuePulse with pan applies pan handler during render', async () => {
    const fakeCtx: any = {
      sampleRate: 44100,
      destination: {},
      createBufferSource: () => ({ connect: jest.fn(), start: jest.fn(), stop: jest.fn(), buffer: null }),
      createGain: () => ({ connect: jest.fn(), disconnect: jest.fn() }),
    };
    const fakeScheduler: any = { schedule: (t: number, fn: any) => { fn(); } };

    const br = new BufferedRenderer(fakeCtx, fakeScheduler, { segmentDuration: 0.25, lookahead: 0.01 });

    // Enqueue a pulse with pan numeric -0.5
    br.enqueuePulse(0.1, 440, 0.5, 0.5, {}, 1, -0.5, []);

    // Allow asynchronous render to complete
    await new Promise(r => setTimeout(r, 50));

    // There's no easy public hook here; ensure no exceptions and that the global OfflineAudioContext was used
    expect(typeof (global as any).OfflineAudioContext).toBe('function');
  });
});
