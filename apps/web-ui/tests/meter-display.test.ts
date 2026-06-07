import { getMeterDisplayGain, scaleRmsForMeter, scaleSamplesForWaveform } from '../src/utils/meter-display';

describe('meter-display utilities', () => {
  test('returns chip-aware gain for NES pulse channel', () => {
    const gain = getMeterDisplayGain('nes', 1);
    expect(gain).toBeCloseTo(1 / (0.00752 * 15), 2);
  });

  test('returns chip-aware gain for SMS tone channel', () => {
    const gain = getMeterDisplayGain('sms', 1);
    expect(gain).toBeGreaterThan(1);
  });

  test('falls back to unity gain for invalid channel ids', () => {
    expect(getMeterDisplayGain('nes', -1)).toBe(1);
  });

  test('scaleRmsForMeter applies gain and clamps to 1', () => {
    expect(scaleRmsForMeter(0.1, 2)).toBeCloseTo(0.2, 6);
    expect(scaleRmsForMeter(0.9, 2)).toBe(1);
  });

  test('scaleSamplesForWaveform scales and clamps samples', () => {
    const scaled = scaleSamplesForWaveform(new Float32Array([-0.8, 0.2, 0.7]), 2);
    expect(scaled[0]).toBe(-1);
    expect(scaled[1]).toBeCloseTo(0.4, 6);
    expect(scaled[2]).toBe(1);
  });
});
