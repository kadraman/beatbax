import { peakLimitForPlayback, PLAYBACK_PEAK_CEILING } from '../src/audio/playbackLimiter';

describe('peakLimitForPlayback', () => {
  test('does not modify buffers already below ceiling', () => {
    const buf = new Float32Array([0, 0.5, -0.5, 0.8]);
    const copy = new Float32Array(buf);
    expect(peakLimitForPlayback(buf)).toBe(false);
    expect(buf).toEqual(copy);
  });

  test('scales down when peak exceeds ceiling', () => {
    const buf = new Float32Array([1.2, -0.6, 0.3]);
    expect(peakLimitForPlayback(buf)).toBe(true);
    expect(Math.max(...buf.map(Math.abs))).toBeCloseTo(PLAYBACK_PEAK_CEILING, 6);
    expect(buf[1]).toBeCloseTo(-0.475, 3);
  });

  test('handles empty buffer', () => {
    const buf = new Float32Array([]);
    expect(peakLimitForPlayback(buf)).toBe(false);
  });
});
