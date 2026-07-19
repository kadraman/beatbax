import {
  AY_CHANNEL_PEAK,
  AY_DAC_LEVELS,
  AY_TARGET_PEAK,
  amplitudeToGain,
  ayDacNormalized,
  clampAyAmplitude,
} from '../src/ay-volume.js';

describe('ay-volume', () => {
  test('DAC table has 16 levels with silent 0 and unit max', () => {
    expect(AY_DAC_LEVELS).toHaveLength(16);
    expect(AY_DAC_LEVELS[0]).toBe(0);
    expect(AY_DAC_LEVELS[15]).toBe(1);
    for (let i = 1; i < 16; i++) {
      expect(AY_DAC_LEVELS[i]).toBeGreaterThan(AY_DAC_LEVELS[i - 1]!);
    }
  });

  test('three channels at vol=15 sum to AY_TARGET_PEAK', () => {
    expect(3 * AY_CHANNEL_PEAK).toBeCloseTo(AY_TARGET_PEAK, 10);
    expect(3 * amplitudeToGain(15)).toBeCloseTo(AY_TARGET_PEAK, 10);
  });

  test('curve is logarithmic vs linear mid-volume', () => {
    // vol=10 is much quieter than linear 10/15 on real AY hardware.
    const dac10 = ayDacNormalized(10);
    const linear10 = 10 / 15;
    expect(dac10).toBeLessThan(linear10 * 0.7);
    expect(dac10).toBeCloseTo(0.3527, 4);
  });

  test('amplitudeToGain scales DAC by channel peak', () => {
    expect(amplitudeToGain(15)).toBeCloseTo(AY_CHANNEL_PEAK, 10);
    expect(amplitudeToGain(0)).toBe(0);
    expect(amplitudeToGain(10)).toBeCloseTo(0.3527 * AY_CHANNEL_PEAK, 4);
  });

  test('clampAyAmplitude rounds and clamps', () => {
    expect(clampAyAmplitude(-1)).toBe(0);
    expect(clampAyAmplitude(16)).toBe(15);
    expect(clampAyAmplitude(10.4)).toBe(10);
    expect(clampAyAmplitude(10.6)).toBe(11);
    expect(clampAyAmplitude(Number.NaN)).toBe(0);
  });
});
