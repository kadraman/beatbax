/**
 * Tests for per-channel analyser feature in Player.
 */
import { Player } from '../src/audio/playback';
import type { ChannelWaveformPayload } from '../src/audio/playback';

function makeAudioContext(overrides: Record<string, any> = {}): any {
  return {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination: { connect: jest.fn() },
    createGain: () => ({
      gain: { setValueAtTime: jest.fn(), value: 1 },
      connect: jest.fn(),
      disconnect: jest.fn(),
    }),
    createAnalyser: () => ({
      fftSize: 512,
      smoothingTimeConstant: 0.8,
      connect: jest.fn(),
      disconnect: jest.fn(),
      getFloatTimeDomainData: jest.fn((buf: Float32Array) => {
        // Fill with a simple sine-ish signal for testing
        for (let i = 0; i < buf.length; i++) buf[i] = Math.sin(i * 0.1) * 0.5;
      }),
    }),
    ...overrides,
  };
}

describe('Player per-channel analyser', () => {
  test('analyser is disabled by default', () => {
    const ctx = makeAudioContext();
    const player: any = new Player(ctx);
    expect(player._enableAnalyser).toBe(false);
    expect(player._channelAnalysers.size).toBe(0);
  });

  test('enablePerChannelAnalyser option activates analyser', () => {
    const ctx = makeAudioContext();
    const player: any = new Player(ctx, { enablePerChannelAnalyser: true });
    expect(player._enableAnalyser).toBe(true);
  });

  test('setPerChannelAnalyser toggles _enableAnalyser', () => {
    const ctx = makeAudioContext();
    const player: any = new Player(ctx);
    player.masterGain = ctx.createGain();
    player.setPerChannelAnalyser(true);
    expect(player._enableAnalyser).toBe(true);
    // Sampling loop should NOT start until _isPlaying is true (opt-in / idle-safe behaviour).
    expect(player._analyserTimer).toBeNull();
    // Simulate playback being active, then re-enable — loop should start now.
    player._isPlaying = true;
    player.setPerChannelAnalyser(false);
    player.setPerChannelAnalyser(true);
    expect(player._analyserTimer).not.toBeNull();
    player.setPerChannelAnalyser(false);
    expect(player._enableAnalyser).toBe(false);
    expect(player._analyserTimer).toBeNull();     // sampling loop stopped
    player._teardownAnalysers(); // cleanup
  });

  test('setPerChannelAnalyser respects config overrides', () => {
    const ctx = makeAudioContext();
    const player: any = new Player(ctx);
    player.masterGain = ctx.createGain();
    player.setPerChannelAnalyser(true, { fftSize: 1024, uiUpdateHz: 10, emittedSampleCount: 64 });
    expect(player._analyserFftSize).toBe(1024);
    expect(player._uiUpdateHz).toBe(10);
    expect(player._emittedSampleCount).toBe(64);
    player._teardownAnalysers(); // cleanup
  });

  test('_getChannelBus creates GainNode and AnalyserNode per channel', () => {
    const ctx = makeAudioContext();
    const player: any = new Player(ctx, { enablePerChannelAnalyser: true });
    // masterGain must exist for connect() to work
    player.masterGain = ctx.createGain();

    const bus = player._getChannelBus(1);
    expect(bus).toBeDefined();
    expect(player._channelAnalysers.size).toBe(1);
    expect(player._channelBuses.size).toBe(1);
    expect(player._analyserBuffers.size).toBe(1);
  });

  test('_getChannelBus returns same node on second call', () => {
    const ctx = makeAudioContext();
    const player: any = new Player(ctx, { enablePerChannelAnalyser: true });
    player.masterGain = ctx.createGain();
    const bus1 = player._getChannelBus(2);
    const bus2 = player._getChannelBus(2);
    expect(bus1).toBe(bus2);
    expect(player._channelBuses.size).toBe(1);
  });

  test('_getChannelDest returns channel bus when analyser enabled', () => {
    const ctx = makeAudioContext();
    const player: any = new Player(ctx, { enablePerChannelAnalyser: true });
    player.masterGain = ctx.createGain();
    const dest = player._getChannelDest(3);
    expect(dest).toBe(player._channelBuses.get(3));
  });

  test('_getChannelDest always returns a channel bus (for per-channel volume)', () => {
    const ctx = makeAudioContext();
    const player: any = new Player(ctx);
    player.masterGain = ctx.createGain();
    // Even without the analyser enabled, a channel bus is created so that
    // per-channel volume (setChannelVolume) can be applied via its GainNode.
    const dest = player._getChannelDest(1);
    expect(dest).toBe(player._channelBuses.get(1));
    expect(player._channelBuses.size).toBe(1);
  });

  test('getChannelAnalyserData returns null when analyser not set up', () => {
    const ctx = makeAudioContext();
    const player = new Player(ctx);
    const result = player.getChannelAnalyserData(1);
    expect(result).toBeNull();
  });

  test('getChannelAnalyserData returns decimated buffer with metadata', () => {
    const ctx = makeAudioContext();
    const player: any = new Player(ctx, { enablePerChannelAnalyser: true, emittedSampleCount: 32 });
    player.masterGain = ctx.createGain();
    player._getChannelBus(1); // sets up analyser for ch1

    const result = player.getChannelAnalyserData(1);
    expect(result).not.toBeNull();
    expect(result!.samples.length).toBe(32);
    expect(result!.sampleRateHint).toBe(44100);
  });

  test('onChannelWaveform callback is called by sampling loop', () => {
    jest.useFakeTimers();
    const ctx = makeAudioContext();
    const player: any = new Player(ctx, { enablePerChannelAnalyser: true, uiUpdateHz: 30, emittedSampleCount: 32 });
    player.masterGain = ctx.createGain();
    player._getChannelBus(1);

    const received: ChannelWaveformPayload[] = [];
    player.onChannelWaveform = (payload: ChannelWaveformPayload) => received.push(payload);
    player._startAnalyserSampling();

    // Advance timer by one interval (~33ms for 30Hz)
    jest.advanceTimersByTime(40);
    expect(received.length).toBeGreaterThanOrEqual(1);
    const p = received[0];
    expect(p.channelId).toBe(1);
    expect(p.format).toBe('float32');
    expect(p.sampleCount).toBe(32);
    expect(p.samples.length).toBe(32);
    expect(p.sampleRateHint).toBe(44100);

    player._stopAnalyserSampling();
    jest.useRealTimers();
  });

  test('disable then re-enable restarts sampling loop without losing channel buses', () => {
    jest.useFakeTimers();
    const ctx = makeAudioContext();
    const player: any = new Player(ctx, { enablePerChannelAnalyser: true, uiUpdateHz: 30, emittedSampleCount: 32 });
    player.masterGain = ctx.createGain();
    player._getChannelBus(1);

    // Enable → start sampling (requires _isPlaying)
    player._isPlaying = true;
    player._startAnalyserSampling();
    expect(player._analyserTimer).not.toBeNull();

    // Disable → stops loop but keeps buses
    player.setPerChannelAnalyser(false);
    expect(player._analyserTimer).toBeNull();
    expect(player._channelBuses.size).toBe(1); // buses NOT torn down
    expect(player._channelAnalysers.size).toBe(1);

    // Re-enable while _isPlaying → sampling restarts immediately
    const received: any[] = [];
    player.onChannelWaveform = (p: any) => received.push(p);
    player.setPerChannelAnalyser(true);
    expect(player._analyserTimer).not.toBeNull();

    jest.advanceTimersByTime(40);
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0].channelId).toBe(1);

    player._teardownAnalysers();
    jest.useRealTimers();
  });

  test('_teardownAnalysers clears all analyser state', () => {
    const ctx = makeAudioContext();
    const player: any = new Player(ctx, { enablePerChannelAnalyser: true });
    player.masterGain = ctx.createGain();
    player._getChannelBus(1);
    player._getChannelBus(2);

    expect(player._channelAnalysers.size).toBe(2);
    player._teardownAnalysers();
    expect(player._channelAnalysers.size).toBe(0);
    expect(player._channelBuses.size).toBe(0);
    expect(player._analyserBuffers.size).toBe(0);
  });
});
