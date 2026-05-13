import { ChipRegistry } from '@beatbax/engine';
import ayPlugin from '../src/index.js';
import { AY_DAC, YM_DAC } from '../src/dac.js';
import { AyChipEmulator } from '../src/emulator.js';

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
  it('accepts tone_noise instruments', () => {
    const errors = ayPlugin.validateInstrument({
      type: 'tone_noise',
      noise_rate: 12,
      env: 'decay_only',
      vol: 12,
    } as any);
    expect(errors).toEqual([]);
  });

  it('rejects simultaneous env_pitch + env_period', () => {
    const errors = ayPlugin.validateInstrument({
      type: 'tone',
      env: 'triangle_down_up',
      vol: 'use_envelope',
      env_pitch: 'A2',
      env_period: 63,
    } as any);
    expect(errors.some((e) => e.field === 'env_period')).toBe(true);
  });

  it('rejects env_period on non-repeating shape', () => {
    const errors = ayPlugin.validateInstrument({
      type: 'tone',
      env: 'decay_only',
      vol: 'use_envelope',
      env_period: 63,
    } as any);
    expect(errors.some((e) => e.field === 'env')).toBe(true);
  });

  it('accepts env_pitch on repeating shapes', () => {
    const errors = ayPlugin.validateInstrument({
      type: 'tone',
      env: 'triangle_down_up',
      vol: 'use_envelope',
      env_pitch: 'A2',
    } as any);
    expect(errors).toEqual([]);
  });
});

describe('dac tables', () => {
  it('contains expected AY and YM entries', () => {
    expect(AY_DAC.length).toBe(32);
    expect(YM_DAC.length).toBe(32);
    expect(AY_DAC[30]).toBeCloseTo(1.0, 6);
    expect(YM_DAC[30]).toBeCloseTo(0.8799268, 6);
  });
});

describe('emulator core behavior', () => {
  it('supports OR-mixed tone+noise output path', () => {
    const emu = new AyChipEmulator('ay');
    emu.writeRegister(0, 8);
    emu.writeRegister(1, 0);
    emu.writeRegister(6, 4);
    emu.writeRegister(7, 0x00); // tone+noise enabled for all channels
    emu.writeRegister(8, 15);

    let sawNonZero = false;
    for (let i = 0; i < 2000; i += 1) {
      emu.clock();
      const s = emu.getChannelSample(0);
      if (Math.abs(s) > 0) {
        sawNonZero = true;
        break;
      }
    }

    expect(sawNonZero).toBe(true);
  });

  it('envelope register writes drive channel amplitude when envelope bit is set', () => {
    const emu = new AyChipEmulator('ym');
    emu.writeRegister(7, 0x3e); // tone on A only
    emu.writeRegister(0, 64);
    emu.writeRegister(1, 0);
    emu.writeRegister(11, 1);
    emu.writeRegister(12, 0);
    emu.writeRegister(13, 10); // triangle down-up
    emu.writeRegister(8, 0x10); // envelope enabled

    const samples: number[] = [];
    for (let i = 0; i < 6000; i += 1) {
      emu.clock();
      if ((i % 64) === 0) samples.push(emu.getChannelSample(0));
    }

    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(max - min).toBeGreaterThan(0.05);
  });
});

describe('channel backend integration', () => {
  const ctx = new (global as any).AudioContext();

  it('renders PCM for tone_noise notes', () => {
    ayPlugin.configureForSong({ chip: 'msx' } as any);
    const ch = ayPlugin.createChannel(0, ctx as any);
    ch.noteOn(220, {
      type: 'tone_noise',
      noise_rate: 6,
      vol: 14,
      env: 'none',
    } as any);

    const buf = new Float32Array(512);
    ch.render(buf, 44100);
    ch.noteOff();

    expect(buf.some((x) => x !== 0)).toBe(true);
  });

  it('accepts worklet path fallback when audioWorklet is unavailable', () => {
    const fakeCtx = {
      currentTime: 0,
      sampleRate: 44100,
      destination: {},
    } as any;

    const ch = ayPlugin.createChannel(0, fakeCtx as any);
    const nodes = ch.createPlaybackNodes?.(
      fakeCtx,
      220,
      0,
      0.1,
      { type: 'tone', vol: 12, env: 'none' } as any,
      {},
      fakeCtx.destination,
    );

    expect(nodes).toBeNull();
  });
});
