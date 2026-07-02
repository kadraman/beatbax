import {
  gbLengthFramesToSeconds,
  parseGbLengthFrames,
  resolveGbNoiseDurationSec,
  resolveGbNoiseDurationSamples,
} from '../../src/chips/gameboy/gbLength.js';

describe('gbLength', () => {
  test('parseGbLengthFrames returns undefined when length is absent', () => {
    expect(parseGbLengthFrames({})).toBeUndefined();
    expect(parseGbLengthFrames({ type: 'noise' })).toBeUndefined();
  });

  test('parseGbLengthFrames clamps to 1–64 frames', () => {
    expect(parseGbLengthFrames({ length: 16 })).toBe(16);
    expect(parseGbLengthFrames({ length: 0 })).toBeUndefined();
    expect(parseGbLengthFrames({ length: 128 })).toBe(64);
  });

  test('resolveGbNoiseDurationSec caps step length by hardware length', () => {
    expect(gbLengthFramesToSeconds(16)).toBeCloseTo(16 / 256);
    expect(resolveGbNoiseDurationSec({ length: 16 }, 0.5)).toBeCloseTo(16 / 256);
    expect(resolveGbNoiseDurationSec({ length: 16 }, 0.01)).toBeCloseTo(0.01);
    expect(resolveGbNoiseDurationSec({}, 0.117)).toBeCloseTo(0.117);
  });

  test('resolveGbNoiseDurationSamples converts seconds cap to samples', () => {
    const samples = resolveGbNoiseDurationSamples(4410, 44100, { length: 16 });
    expect(samples).toBe(Math.ceil((16 / 256) * 44100));
  });
});
