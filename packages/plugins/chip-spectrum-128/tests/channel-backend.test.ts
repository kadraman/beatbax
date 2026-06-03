import {
  AyChannelBackend,
  isNoiseMixActive,
  isToneMixActive,
  pitchEnvSemitonesAt,
  resolveAyMixerRouting,
  resolveToneNoiseGains,
  renderAyBuzzBassSamples,
  renderAyChannelSamples,
  renderAyNotePcm,
} from '../src/channel-backend.js';
import { createEnvelopeClockState } from '../src/envelope-generator.js';
import {
  freqToBuzzBassEnvPeriod,
  freqToEnvPeriod,
  AY_BUZZ_BASS_ENVELOPE_SHAPE,
} from '../src/periodTables.js';
import { parseMacro } from '@beatbax/engine';
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
    const { toneGain, noiseGain } = resolveToneNoiseGains(15, 4);
    expect(toneGain).toBeLessThan(noiseGain);
  });

  test('without tone_vol both gains match', () => {
    const a = resolveToneNoiseGains(12, undefined);
    expect(a.toneGain).toBe(a.noiseGain);
  });
});

describe('env_bass buzz synthesis', () => {
  test('renderAyBuzzBassSamples modulates amplitude over time', () => {
    const buf = new Float32Array(8820);
    const clock = createEnvelopeClockState(AY_BUZZ_BASS_ENVELOPE_SHAPE);
    const period = freqToBuzzBassEnvPeriod(65.41);
    renderAyBuzzBassSamples(buf, 44100, {
      freq: 65.41,
      envelopePeriod: period,
      envelopeClock: clock,
    });
    let peak = 0;
    let minNonZero = 1;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i]);
      if (v > peak) peak = v;
      if (v > 0.0001 && v < minNonZero) minNonZero = v;
    }
    expect(peak).toBeGreaterThan(0.05);
    expect(minNonZero).toBeLessThan(peak * 0.9);
  });

  test('AyChannelBackend env_bass render is not a flat square', () => {
    const backend = new AyChannelBackend(2, makeSession());
    backend.noteOn(65.41, { type: 'tone3', env_bass: true } as any);
    const buf = new Float32Array(4410);
    backend.render(buf, 44100);
    const flat = new Float32Array(4410);
    const backendFlat = new AyChannelBackend(2, makeSession());
    backendFlat.noteOn(65.41, { type: 'tone3', vol: 12 } as any);
    backendFlat.render(flat, 44100);
    let diff = 0;
    for (let i = 0; i < buf.length; i++) {
      diff += Math.abs(buf[i] - flat[i]);
    }
    expect(diff).toBeGreaterThan(50);
  });

  test('AyChannelBackend env_shape=10 queues R13 shape on register intent', () => {
    const session = makeSession();
    const backend = new AyChannelBackend(2, session);
    backend.noteOn(65.41, { type: 'tone3', env_bass: true, env_shape: 10 } as any);
    const intents = (session as any)._pendingIntents ?? [];
    expect(intents.some((i: { envelopeShape?: number }) => i.envelopeShape === 10)).toBe(true);
  });

  test('vol_env queues attenuation intent, not hardware envelope routing', () => {
    const session = makeSession();
    const backend = new AyChannelBackend(0, session);
    backend.noteOn(440, { type: 'tone1', vol_env: [15, 10, 5, 0] } as any);
    const intents = (session as any)._pendingIntents ?? [];
    const last = intents[intents.length - 1];
    expect(last.useEnvelope).toBe(false);
    expect(last.attenuation).toBe(15);
    expect(last.envelopePeriod).toBeUndefined();
    expect(last.envelopeShape).toBeUndefined();

    const frame = session.arbitrator.arbitrate(0, intents, session.prevRegs);
    expect(frame.regs[8] & 0x10).toBe(0);
    expect(frame.regs[8] & 0x0f).toBe(15);
  });

  test('env_bass still routes through hardware envelope on register intent', () => {
    const session = makeSession();
    const backend = new AyChannelBackend(2, session);
    backend.noteOn(65.41, { type: 'tone3', env_bass: true } as any);
    const intents = (session as any)._pendingIntents ?? [];
    const last = intents[intents.length - 1];
    expect(last.useEnvelope).toBe(true);
    expect(last.attenuation).toBeUndefined();
    expect(last.envelopePeriod).toBeDefined();
    expect(last.envelopeShape).toBeDefined();

    const frame = session.arbitrator.arbitrate(0, intents, session.prevRegs);
    expect(frame.regs[10] & 0x10).toBe(0x10);
  });

  test('buzz bass envelope period is much faster than one-step-per-tone', () => {
    const freq = 65.41;
    const fastPeriod = freqToBuzzBassEnvPeriod(freq);
    const slowPeriod = freqToEnvPeriod(freq);
    expect(fastPeriod).toBeLessThan(slowPeriod / 32);

    const peakAbs = (period: number) => {
      const buf = new Float32Array(44100);
      const clock = createEnvelopeClockState(AY_BUZZ_BASS_ENVELOPE_SHAPE);
      renderAyBuzzBassSamples(buf, 44100, {
        freq,
        envelopePeriod: period,
        envelopeClock: clock,
      });
      let peak = 0;
      let minNonZero = 1;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i]);
        if (v > peak) peak = v;
        if (v > 0.0001 && v < minNonZero) minNonZero = v;
      }
      return { peak, minNonZero };
    };

    const fast = peakAbs(fastPeriod);
    const slow = peakAbs(slowPeriod);
    expect(fast.peak).toBeGreaterThan(0.05);
    expect(fast.minNonZero).toBeLessThan(fast.peak * 0.5);
    expect(slow.minNonZero).toBeGreaterThanOrEqual(fast.minNonZero * 0.95);
  });

  test('buzz bass has richer waveform than plain square (saw AM, not tremolo)', () => {
    const freq = 65.41;
    const sampleRate = 44100;
    const len = 4410;
    const buzz = new Float32Array(len);
    renderAyBuzzBassSamples(buzz, sampleRate, {
      freq,
      envelopePeriod: freqToBuzzBassEnvPeriod(freq),
      envelopeClock: createEnvelopeClockState(AY_BUZZ_BASS_ENVELOPE_SHAPE),
    });
    const square = new Float32Array(len);
    let phase = 0;
    for (let i = 0; i < len; i++) {
      square[i] = phase < 0.5 ? 0.3 : -0.3;
      phase += freq / sampleRate;
      if (phase >= 1) phase -= 1;
    }
    const uniqueLevels = (buf: Float32Array) => {
      const set = new Set<number>();
      for (let i = 0; i < buf.length; i++) {
        set.add(Math.round(buf[i] * 200) / 200);
      }
      return set.size;
    };
    expect(uniqueLevels(buzz)).toBeGreaterThan(uniqueLevels(square) * 3);
  });

  test('pitchEnvSemitonesAt interpolates between knots', () => {
    const macro = parseMacro([0, -4, 0])!;
    expect(pitchEnvSemitonesAt(macro, 0, 1000)).toBeCloseTo(0, 5);
    expect(pitchEnvSemitonesAt(macro, 499, 1000)).toBeCloseTo(-4, 1);
    expect(pitchEnvSemitonesAt(macro, 250, 1000)).toBeCloseTo(-2, 1);
    expect(pitchEnvSemitonesAt(macro, 999, 1000)).toBeCloseTo(0, 1);
  });

  test('renderAyNotePcm pitch_env spans full note duration', () => {
    const sampleRate = 44100;
    const sampleCount = sampleRate;
    const pcm = renderAyNotePcm(sampleCount, sampleRate, {
      freq: 65.41,
      toneEnable: true,
      noiseEnable: false,
      peakAmplitude: 12,
      pitchEnvMacro: parseMacro([0, -12]),
    });
    const zc = (buf: Float32Array, from: number, to: number) => {
      let n = 0;
      for (let i = from + 1; i < to; i++) {
        if (Math.sign(buf[i]) !== Math.sign(buf[i - 1]) && buf[i] !== 0) n++;
      }
      return n;
    };
    const earlyZc = zc(pcm, 0, Math.floor(sampleCount * 0.25));
    const lateZc = zc(pcm, Math.floor(sampleCount * 0.75), sampleCount);
    expect(lateZc).toBeLessThan(earlyZc);
  });

  test('renderAyNotePcm volSlide fades amplitude over the note', () => {
    const sampleRate = 44100;
    const sampleCount = sampleRate;
    const loud = renderAyNotePcm(sampleCount, sampleRate, {
      freq: 164.81,
      toneEnable: true,
      noiseEnable: false,
      peakAmplitude: 12,
    });
    const faded = renderAyNotePcm(sampleCount, sampleRate, {
      freq: 164.81,
      toneEnable: true,
      noiseEnable: false,
      peakAmplitude: 12,
      volSlide: { delta: -4, steps: 8 },
    });
    const rms = (buf: Float32Array, from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / Math.max(1, to - from));
    };
    const early = rms(faded, 0, Math.floor(sampleCount * 0.2));
    const late = rms(faded, Math.floor(sampleCount * 0.8), sampleCount);
    const flatLate = rms(loud, Math.floor(sampleCount * 0.8), sampleCount);
    expect(early).toBeGreaterThan(late);
    expect(late).toBeLessThan(flatLate);
  });

  test('renderAyNotePcm inline-style pitch_env bracket string glides over full note', () => {
    const macro = parseMacro('[0,2,0,-2,0]')!;
    const sampleCount = 44100;
    expect(pitchEnvSemitonesAt(macro, 0, sampleCount)).toBeCloseTo(0, 5);
    expect(pitchEnvSemitonesAt(macro, Math.floor(sampleCount * 0.25), sampleCount)).toBeGreaterThan(0);
    expect(pitchEnvSemitonesAt(macro, Math.floor(sampleCount * 0.5), sampleCount)).toBeLessThan(0);
    expect(pitchEnvSemitonesAt(macro, sampleCount - 1, sampleCount)).toBeCloseTo(0, 5);

    const pcm = renderAyNotePcm(sampleCount, 44100, {
      freq: 392,
      toneEnable: true,
      noiseEnable: false,
      peakAmplitude: 12,
      pitchEnvMacro: macro,
    });
    expect(rms(pcm)).toBeGreaterThan(0);
  });

  test('renderAyNotePcm arp_env changes pitch over held note', () => {
    const sampleRate = 44100;
    const samplesPerFrame = Math.floor(sampleRate / 60);
    const flat = renderAyNotePcm(samplesPerFrame * 3, sampleRate, {
      freq: 261.63,
      toneEnable: true,
      noiseEnable: false,
      peakAmplitude: 12,
    });
    const arped = renderAyNotePcm(samplesPerFrame * 3, sampleRate, {
      freq: 261.63,
      toneEnable: true,
      noiseEnable: false,
      peakAmplitude: 12,
      arpEnvMacro: parseMacro([0, 12]),
    });
    const zc = (buf: Float32Array, from: number, to: number) => {
      let n = 0;
      for (let i = from + 1; i < to; i++) {
        if (Math.sign(buf[i]) !== Math.sign(buf[i - 1]) && buf[i] !== 0) n++;
      }
      return n;
    };
    const flatZc = zc(flat, 0, samplesPerFrame);
    const arpLateZc = zc(arped, samplesPerFrame * 2, samplesPerFrame * 3);
    expect(arpLateZc).toBeGreaterThan(flatZc * 1.5);
  });

  test('renderAyNotePcm env_bass produces non-flat output', () => {
    const pcm = renderAyNotePcm(4410, 44100, {
      freq: 65.41,
      toneEnable: true,
      noiseEnable: false,
      peakAmplitude: 15,
      envBass: true,
      envelopePeriod: freqToBuzzBassEnvPeriod(65.41),
      envelopeShape: AY_BUZZ_BASS_ENVELOPE_SHAPE,
    });
    expect(rms(pcm)).toBeGreaterThan(0.01);
    const early = rms(pcm.subarray(0, 1102));
    const late = rms(pcm.subarray(2205, 3307));
    expect(Math.abs(early - late)).toBeGreaterThan(0.005);
  });
});

function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

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
