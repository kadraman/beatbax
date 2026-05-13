import { ChipRegistry } from '@beatbax/engine';
import ayPlugin from '../src/index.js';
import { AyEnvelopeGenerator } from '../src/envelope.js';
import { AyToneOscillator, AyNoiseOscillator } from '../src/oscillator.js';

describe('ay plugin metadata', () => {
  it('registers canonical name and aliases', () => {
    const registry = new ChipRegistry();
    registry.register(ayPlugin);
    expect(registry.get('ay3-8910')).toBe(ayPlugin);
    expect(registry.get('ay')).toBe(ayPlugin);
    expect(registry.get('ym2149')).toBe(ayPlugin);
    expect(registry.get('atari-st')).toBe(ayPlugin);
    expect(registry.get('msx')).toBe(ayPlugin);
  });

  it('exposes 3 channels', () => {
    expect(ayPlugin.channels).toBe(3);
  });
});

describe('ay instrument validation', () => {
  it('accepts valid tone instrument', () => {
    const errors = ayPlugin.validateInstrument({ type: 'tone', env: 'attack_decay', vol: 'use_envelope' } as any);
    expect(errors).toEqual([]);
  });

  it('accepts valid noise instrument', () => {
    const errors = ayPlugin.validateInstrument({ type: 'noise', noise: 'on', noise_rate: 12, vol: 14 } as any);
    expect(errors).toEqual([]);
  });

  it('accepts macro fields', () => {
    const errors = ayPlugin.validateInstrument({
      type: 'tone',
      vol_env: [15, 12, 8, 4, 0],
      arp_env: [0, 4, 7],
      pitch_env: [0, -1, -2],
      noise_rate_env: [0, 8, 16, 24],
    } as any);
    expect(errors).toEqual([]);
  });

  it('rejects unsupported type', () => {
    const errors = ayPlugin.validateInstrument({ type: 'pulse1' } as any);
    expect(errors.some((e) => e.field === 'type')).toBe(true);
  });

  it('rejects out of range noise rate', () => {
    const errors = ayPlugin.validateInstrument({ type: 'noise', noise_rate: 42 } as any);
    expect(errors.some((e) => e.field === 'noise_rate')).toBe(true);
  });
});

describe('envelope and oscillators', () => {
  it('envelope decay_only reaches silence', () => {
    const env = new AyEnvelopeGenerator();
    env.reset('decay_only');
    for (let i = 0; i < 20; i += 1) env.tick();
    expect(env.level()).toBe(0);
  });

  it('tone oscillator generates bipolar waveform', () => {
    const tone = new AyToneOscillator();
    tone.setFrequency(22050);
    const out = Array.from({ length: 64 }, () => tone.next(44100));
    expect(out.some((v) => v > 0)).toBe(true);
    expect(out.some((v) => v < 0)).toBe(true);
  });

  it('noise oscillator produces non-constant output', () => {
    const noise = new AyNoiseOscillator();
    noise.setRate(8);
    const out = Array.from({ length: 4096 }, () => noise.next(44100));
    const unique = new Set(out);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('lower noise_rate yields brighter/faster noise than higher noise_rate', () => {
    const bright = new AyNoiseOscillator();
    bright.setRate(2);
    const dark = new AyNoiseOscillator();
    dark.setRate(7);

    const countTransitions = (values: number[]): number => {
      let transitions = 0;
      for (let i = 1; i < values.length; i += 1) {
        if (values[i] !== values[i - 1]) transitions += 1;
      }
      return transitions;
    };

    const brightOut = Array.from({ length: 8192 }, () => bright.next(44100));
    const darkOut = Array.from({ length: 8192 }, () => dark.next(44100));

    expect(countTransitions(brightOut)).toBeGreaterThan(countTransitions(darkOut));
  });
});

describe('channel backend', () => {
  const ctx = new (global as any).AudioContext();

  it('creates channels for valid indices and renders safely', () => {
    for (let i = 0; i < 3; i += 1) {
      const ch = ayPlugin.createChannel(i, ctx as any);
      ch.noteOn(440, { type: 'tone', vol: 15 } as any);
      ch.applyEnvelope(0);
      const buf = new Float32Array(128);
      ch.render(buf, 44100);
      expect(buf.some((x) => x !== 0)).toBe(true);
      ch.noteOff();
    }
  });

  it('creates Web Audio nodes for noise notes', () => {
    const ch = ayPlugin.createChannel(0, ctx as any);
    const nodes = ch.createPlaybackNodes?.(ctx as any, 220, 0, 0.1, { type: 'noise', noise: 'on' } as any, {}, ctx.destination);
    expect(nodes && nodes.length).toBeGreaterThan(0);
  });

  it('renders noise_rate_env into one-shot LFSR noise buffer for Web Audio', () => {
    const createdBufferLengths: number[] = [];
    let playbackRateWrites = 0;
    const fakeCtx = {
      destination: {},
      createBufferSource() {
        return {
          buffer: null,
          loop: false,
          playbackRate: {
            setValueAtTime() {
              playbackRateWrites += 1;
            },
          },
          connect() { return this; },
          start() {},
          stop() {},
        };
      },
      createBuffer(_channels: number, length: number, _sampleRate: number) {
        createdBufferLengths.push(length);
        return {
          getChannelData() {
            return new Float32Array(length);
          },
        };
      },
      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            setValueCurveAtTime() {},
          },
          connect() { return this; },
        };
      },
      sampleRate: 44100,
    } as any;

    const ch = ayPlugin.createChannel(0, fakeCtx as any);
    const nodes = ch.createPlaybackNodes?.(
      fakeCtx as any,
      220,
      0,
      0.1,
      { type: 'noise', noise: 'on', noise_rate: 12, noise_rate_env: '[12,8,4,2]' } as any,
      {},
      fakeCtx.destination,
    );

    // Should return nodes (Web Audio path), not null.
    expect(nodes && nodes.length).toBeGreaterThan(0);
    // Noise is rendered into a one-shot note buffer (no playbackRate automation).
    expect(createdBufferLengths.length).toBeGreaterThan(0);
    expect(createdBufferLengths[0]).toBeGreaterThan(4000);
    expect(playbackRateWrites).toBe(0);
  });

  it('schedules arp_env frequency automation for tone notes', () => {
    const scheduled: Array<{ value: number; time: number }> = [];
    const fakeCtx = {
      destination: {},
      createOscillator() {
        return {
          type: '',
          frequency: {
            setValueAtTime(value: number, time: number) {
              scheduled.push({ value, time });
            },
          },
          setPeriodicWave() {},
          connect() {},
          start() {},
          stop() {},
        };
      },
      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            setValueCurveAtTime() {},
          },
          connect() {},
        };
      },
    } as any;

    const ch = ayPlugin.createChannel(0, fakeCtx as any);
    ch.createPlaybackNodes?.(
      fakeCtx as any,
      220,
      0,
      0.05,
      { type: 'tone', vol: 15, arp_env: '[0,4,7|0]' } as any,
      {},
      fakeCtx.destination,
    );

    const freqValues = scheduled.map(entry => entry.value);
    expect(freqValues[0]).toBe(220);
    expect(freqValues).toContainEqual(expect.closeTo(220 * Math.pow(2, 4 / 12), 6));
    expect(freqValues).toContainEqual(expect.closeTo(220 * Math.pow(2, 7 / 12), 6));
  });

  it('uses AY envelope-shape gain curve in Web Audio path', () => {
    const setCurve = jest.fn();
    const fakeCtx = {
      destination: {},
      createOscillator() {
        return {
          type: '',
          frequency: {
            setValueAtTime() {},
          },
          setPeriodicWave() {},
          connect() {},
          start() {},
          stop() {},
        };
      },
      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            setValueCurveAtTime: setCurve,
          },
          connect() {},
        };
      },
    } as any;

    const ch = ayPlugin.createChannel(0, fakeCtx as any);
    ch.createPlaybackNodes?.(
      fakeCtx as any,
      220,
      0,
      0.3,
      { type: 'tone', env: 'attack_decay', vol: 'use_envelope' } as any,
      {},
      fakeCtx.destination,
    );

    expect(setCurve).toHaveBeenCalled();
    const [curve] = setCurve.mock.calls[0];
    expect(curve[0]).toBeCloseTo(0, 4);
    expect(curve.some((v: number) => v > 0.9)).toBe(true);
  });
});
