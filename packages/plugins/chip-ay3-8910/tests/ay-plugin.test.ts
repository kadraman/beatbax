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
    tone.setFrequency(440);
    const out = Array.from({ length: 16 }, () => tone.next(44100));
    expect(out.some((v) => v > 0)).toBe(true);
    expect(out.some((v) => v < 0)).toBe(true);
  });

  it('noise oscillator produces non-constant output', () => {
    const noise = new AyNoiseOscillator();
    noise.setRate(8);
    const out = Array.from({ length: 128 }, () => noise.next(44100));
    const unique = new Set(out);
    expect(unique.size).toBeGreaterThan(1);
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

  it('falls back to PCM for noise Web Audio notes', () => {
    const ch = ayPlugin.createChannel(0, ctx as any);
    const nodes = ch.createPlaybackNodes?.(ctx as any, 220, 0, 0.1, { type: 'noise', noise: 'on' } as any, {}, ctx.destination);
    expect(nodes).toBeNull();
  });
});
