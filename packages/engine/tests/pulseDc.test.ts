import {
  attachBipolarPulseDc,
  bandLimitedPulseSample,
  bipolarPulseDcOffset,
  createBipolarPulsePeriodicWave,
  fillBipolarPulseFourierCoeffs,
  getPulseFourierCache,
  setBipolarPulseDcOffset,
  synthesizeBipolarPulseWave,
} from '../src/chips/pulseDc.js';

function pcmPulse(duty: number, sampleCount: number): Float32Array {
  const d = Math.max(0, Math.min(1, duty));
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    out[i] = i / sampleCount < d ? 1 : -1;
  }
  return out;
}

function meanRms(samples: Float32Array): { mean: number; rms: number; absPeak: number } {
  let sum = 0;
  let sum2 = 0;
  let absPeak = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    sum += x;
    sum2 += x * x;
    absPeak = Math.max(absPeak, Math.abs(x));
  }
  const n = samples.length;
  return { mean: sum / n, rms: Math.sqrt(sum2 / n), absPeak };
}

describe('bipolarPulseDcOffset', () => {
  test('matches mean of a ±1 pulse for common duties', () => {
    expect(bipolarPulseDcOffset(0.5)).toBeCloseTo(0, 10);
    expect(bipolarPulseDcOffset(0.25)).toBeCloseTo(-0.5, 10);
    expect(bipolarPulseDcOffset(0.125)).toBeCloseTo(-0.75, 10);
    expect(bipolarPulseDcOffset(0.75)).toBeCloseTo(0.5, 10);
  });

  test('clamps and tolerates bad input', () => {
    expect(bipolarPulseDcOffset(-1)).toBe(-1);
    expect(bipolarPulseDcOffset(2)).toBe(1);
    expect(bipolarPulseDcOffset(Number.NaN)).toBe(0);
  });
});

describe('bipolar pulse Fourier coeffs (#271)', () => {
  test('50% duty uses classic odd-harmonic square amplitudes (peak ~1, not ~2)', () => {
    const real = new Float32Array(256);
    const imag = new Float32Array(256);
    fillBipolarPulseFourierCoeffs(real, imag, 0.5, 200);
    expect(real[1]).toBeCloseTo(0, 6);
    expect(imag[1]).toBeCloseTo(4 / Math.PI, 5);
    expect(imag[2]).toBeCloseTo(0, 6);
    expect(imag[3]).toBeCloseTo(4 / (3 * Math.PI), 5);

    const wave = synthesizeBipolarPulseWave(0.5, 4096, 200);
    const { absPeak, mean, rms } = meanRms(wave);
    expect(mean).toBeCloseTo(0, 5);
    expect(rms).toBeCloseTo(1, 2);
    expect(absPeak).toBeLessThan(1.25);
    expect(absPeak).toBeGreaterThan(0.9);
  });

  test.each([0.125, 0.25, 0.5, 0.75])(
    'synthesized wave mean/RMS match PCM at duty=%s',
    (duty) => {
      const N = 8192;
      const pcm = meanRms(pcmPulse(duty, N));
      const synth = meanRms(synthesizeBipolarPulseWave(duty, N, 200));
      expect(synth.mean).toBeCloseTo(pcm.mean, 5);
      expect(synth.rms).toBeCloseTo(pcm.rms, 2);
      expect(synth.absPeak).toBeLessThan(1.25);
    },
  );

  test('createBipolarPulsePeriodicWave disables normalization', () => {
    const createPeriodicWave = jest.fn((..._args: unknown[]) => ({ tag: 'pw' }));
    const ctx = { createPeriodicWave } as unknown as BaseAudioContext;
    const wave = createBipolarPulsePeriodicWave(ctx, 0.25);
    expect(wave).toEqual({ tag: 'pw' });
    expect(createPeriodicWave).toHaveBeenCalledWith(
      expect.any(Float32Array),
      expect.any(Float32Array),
      { disableNormalization: true },
    );
    const call = createPeriodicWave.mock.calls[0] as unknown as [Float32Array, Float32Array, object];
    expect(call[0][1]).not.toBe(0);
    expect(call[1][1]).not.toBe(0);
  });
});

describe('bandLimitedPulseSample Nyquist cap', () => {
  test('44.1 kHz / 8 kHz retains the 16 kHz second harmonic', () => {
    // 25% duty has a non-zero even harmonic; 50% does not.
    const cache = getPulseFourierCache(0.25, 200);
    expect(Math.max(0, Math.ceil((44100 * 0.5) / 8000) - 1)).toBe(2);
    const phase = 0.125;
    const withCap = bandLimitedPulseSample(phase, cache, 8000, 44100);
    const onlyOne = bandLimitedPulseSample(phase, { ...cache, maxHarmonic: 1 }, undefined, undefined);
    const withTwo = bandLimitedPulseSample(phase, { ...cache, maxHarmonic: 2 }, undefined, undefined);
    expect(withCap).toBeCloseTo(withTwo, 10);
    expect(Math.abs(withCap - onlyOne)).toBeGreaterThan(0.05);
  });

  test('frequencies at or above Nyquist contribute only DC', () => {
    const cache = getPulseFourierCache(0.25, 200);
    expect(bandLimitedPulseSample(0.25, cache, 22050, 44100)).toBeCloseTo(cache.dc, 10);
    expect(bandLimitedPulseSample(0.25, cache, 24000, 44100)).toBeCloseTo(cache.dc, 10);
  });
});

describe('attachBipolarPulseDc', () => {
  function makeCtx() {
    const dc = {
      offset: { setValueAtTime: jest.fn(), value: 0 },
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    };
    const ctx: any = {
      createConstantSource: jest.fn(() => dc),
    };
    const gain = {} as AudioNode;
    return { ctx, gain, dc };
  }

  test('wires ConstantSource into the gain with 2d-1 offset (#271)', () => {
    const { ctx, gain, dc } = makeCtx();
    const out = attachBipolarPulseDc(ctx, gain, 0.25, 1.5, 2.5);
    expect(out).toBe(dc);
    expect(ctx.createConstantSource).toHaveBeenCalled();
    expect(dc.offset.setValueAtTime).toHaveBeenCalledWith(-0.5, 1.5);
    expect(dc.connect).toHaveBeenCalledWith(gain);
    expect(dc.start).toHaveBeenCalledWith(1.5);
    expect(dc.stop).toHaveBeenCalledWith(2.5);
  });

  test('returns null when ConstantSourceNode is unavailable', () => {
    const ctx = {} as BaseAudioContext;
    expect(attachBipolarPulseDc(ctx, {} as AudioNode, 0.5, 0, 1)).toBeNull();
  });

  test('setBipolarPulseDcOffset updates an existing source', () => {
    const dc = { offset: { setValueAtTime: jest.fn() } };
    setBipolarPulseDcOffset(dc, 0.125, 3);
    expect(dc.offset.setValueAtTime).toHaveBeenCalledWith(-0.75, 3);
  });
});
