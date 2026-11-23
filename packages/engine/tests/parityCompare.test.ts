import { compareParity } from '../src/audio/parityCompare.js';

describe('compareParity channel layout', () => {
  test('even-length mono buffers keep their samples and timing', () => {
    const mono = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    for (const channels of [1, undefined] as const) {
      const stats = compareParity(mono, mono, { sampleRate: 4, channels, preprocess: false });
      expect(stats.lengthA).toBe(4);
      expect(stats.lengthB).toBe(4);
      expect(stats.bestLagSamples).toBeCloseTo(0, 10);
      expect(stats.rmsA).toBeCloseTo(Math.sqrt((0.01 + 0.04 + 0.09 + 0.16) / 4), 6);
    }
  });

  test('explicit stereo buffers are downmixed before compare', () => {
    // L/R pairs: (0.2, 0.4) and (0.6, 0.8) → mono [0.3, 0.7]
    const stereoA = new Float32Array([0.2, 0.4, 0.6, 0.8]);
    const stereoB = new Float32Array([0.3, 0.3, 0.7, 0.7]);
    const stats = compareParity(stereoA, stereoB, { sampleRate: 2, channels: 2, preprocess: false });
    expect(stats.lengthA).toBe(2);
    expect(stats.lengthB).toBe(2);
    expect(stats.bestCorrelation).toBeCloseTo(1, 5);
  });
});
