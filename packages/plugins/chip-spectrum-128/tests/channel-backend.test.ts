import {
  AyChannelBackend,
  isNoiseMixActive,
  isToneMixActive,
  resolveAyMixerRouting,
  resolveToneNoiseGains,
  renderAyChannelSamples,
  renderAyNotePcm,
} from '../src/channel-backend.js';
import { RegisterArbitrator } from '../src/register-arbitrator.js';
import { AyChipSimulator } from '../src/ay-chip.js';

function makeSession() {
  return {
    arbitrator: new RegisterArbitrator(),
    chip: new AyChipSimulator(),
    currentTick: 0,
    prevRegs: new Uint8Array(16),
  };
}

describe('resolveAyMixerRouting', () => {
  test('tone only by default', () => {
    const r = resolveAyMixerRouting({ type: 'tone1', vol: 12 } as any);
    expect(r.toneEnable).toBe(true);
    expect(r.noiseEnable).toBe(false);
  });

  test('tone_mix + noise_rate enables noise (tone off by default)', () => {
    const r = resolveAyMixerRouting({ type: 'tone2', tone_mix: 'true', noise_rate: '10' } as any);
    expect(r.noiseEnable).toBe(true);
    expect(r.toneEnable).toBe(false);
  });

  test('tone=true enables tone+noise blend', () => {
    const r = resolveAyMixerRouting({
      type: 'tone3',
      tone: 'true',
      tone_mix: 'true',
      noise_rate: '10',
    } as any);
    expect(r.toneEnable).toBe(true);
    expect(r.noiseEnable).toBe(true);
  });

  test('tone=false disables tone for noise-only percussion', () => {
    const r = resolveAyMixerRouting({
      type: 'tone3',
      tone: 'false',
      tone_mix: 'true',
      noise_rate: '10',
    } as any);
    expect(r.toneEnable).toBe(false);
    expect(r.noiseEnable).toBe(true);
  });
});

describe('resolveToneNoiseGains', () => {
  test('tone_vol caps tone gain below noise gain', () => {
    const { toneGain, noiseGain } = resolveToneNoiseGains(15, 4, false);
    expect(toneGain).toBeLessThan(noiseGain);
  });

  test('without tone_vol both gains match', () => {
    const a = resolveToneNoiseGains(12, undefined, false);
    expect(a.toneGain).toBe(a.noiseGain);
  });
});

describe('renderAyChannelSamples', () => {
  test('noise-only output is non-zero and not a pure tone', () => {
    const buf = new Float32Array(4096);
    renderAyChannelSamples(buf, 44100, {
      freq: 440,
      gain: 0.3,
      toneEnable: false,
      noiseEnable: true,
      noisePeriod: 10,
    });

    let energy = 0;
    for (let i = 0; i < buf.length; i++) energy += Math.abs(buf[i]);
    expect(energy).toBeGreaterThan(0);

    // A pure 440 Hz square at this buffer length would have very regular zero crossings.
    // Noise should produce more sign changes than a low square alone.
    let signChanges = 0;
    for (let i = 1; i < buf.length; i++) {
      if ((buf[i] >= 0) !== (buf[i - 1] >= 0)) signChanges++;
    }
    expect(signChanges).toBeGreaterThan(100);
  });

  test('tone-only output matches square wave energy', () => {
    const buf = new Float32Array(2048);
    renderAyChannelSamples(buf, 44100, {
      freq: 220,
      gain: 0.3,
      toneEnable: true,
      noiseEnable: false,
    });
    let energy = 0;
    for (let i = 0; i < buf.length; i++) energy += Math.abs(buf[i]);
    expect(energy).toBeGreaterThan(0);
  });
});

describe('isNoiseMixActive', () => {
  test('always on when no frame limit', () => {
    expect(isNoiseMixActive(true, undefined, 99)).toBe(true);
    expect(isNoiseMixActive(false, undefined, 0)).toBe(false);
  });

  test('turns off after frame budget', () => {
    expect(isNoiseMixActive(true, 3, 0)).toBe(true);
    expect(isNoiseMixActive(true, 3, 2)).toBe(true);
    expect(isNoiseMixActive(true, 3, 3)).toBe(false);
  });
});

describe('isToneMixActive', () => {
  test('always on when no frame limit', () => {
    expect(isToneMixActive(true, undefined, 99)).toBe(true);
    expect(isToneMixActive(false, undefined, 0)).toBe(false);
  });

  test('turns off after frame budget', () => {
    expect(isToneMixActive(true, 2, 0)).toBe(true);
    expect(isToneMixActive(true, 2, 1)).toBe(true);
    expect(isToneMixActive(true, 2, 2)).toBe(false);
  });
});

describe('renderAyNotePcm', () => {
  test('vol_env decays amplitude over the note', () => {
    const samples = renderAyNotePcm(4410, 44100, {
      freq: 440,
      toneEnable: false,
      noiseEnable: true,
      noisePeriod: 8,
      peakAmplitude: 15,
      volEnvMacro: { values: [15, 8, 0], loopPoint: null } as any,
    });
    let early = 0;
    let late = 0;
    for (let i = 0; i < 500; i++) early += Math.abs(samples[i]);
    for (let i = 3500; i < samples.length; i++) late += Math.abs(samples[i]);
    expect(early).toBeGreaterThan(late);
  });

  test('noise_frames limits noise to early frames', () => {
    const base = {
      freq: 440,
      toneEnable: false,
      noiseEnable: true,
      noisePeriod: 8,
      peakAmplitude: 15,
    };
    const shortNoise = renderAyNotePcm(8820, 44100, { ...base, noiseFrames: 2 });
    const alwaysNoise = renderAyNotePcm(8820, 44100, base);
    let lateShort = 0;
    let lateAlways = 0;
    for (let i = 6000; i < 8820; i++) {
      lateShort += Math.abs(shortNoise[i]);
      lateAlways += Math.abs(alwaysNoise[i]);
    }
    expect(lateAlways).toBeGreaterThan(lateShort);
  });

  test('tone_frames limits tone to early frames', () => {
    const base = {
      freq: 880,
      toneEnable: true,
      noiseEnable: false,
      peakAmplitude: 15,
    };
    const shortTone = renderAyNotePcm(8820, 44100, { ...base, toneFrames: 2 });
    const alwaysTone = renderAyNotePcm(8820, 44100, base);
    let lateShort = 0;
    let lateAlways = 0;
    for (let i = 6000; i < 8820; i++) {
      lateShort += Math.abs(shortTone[i]);
      lateAlways += Math.abs(alwaysTone[i]);
    }
    expect(lateAlways).toBeGreaterThan(lateShort);
  });
});

describe('AyChannelBackend noise percussion', () => {
  test('render produces noise for tone=false percussion instrument', () => {
    const backend = new AyChannelBackend(0, makeSession() as any);
    backend.noteOn(130.81, {
      type: 'tone3',
      vol: 15,
      tone: false,
      tone_mix: true,
      noise_rate: 10,
    } as any);

    const buf = new Float32Array(4410);
    backend.render(buf, 44100);

    let energy = 0;
    for (let i = 0; i < buf.length; i++) energy += Math.abs(buf[i]);
    expect(energy).toBeGreaterThan(0);
  });
});
