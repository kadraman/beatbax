import { freqFromRegister, registerFromFreq } from '../../src/chips/gameboy/periodTables';

describe('GameBoy periodTables', () => {
  test('freqFromRegister basic values', () => {
    expect(freqFromRegister(0)).toBeCloseTo(131072 / 2048, 6);
    expect(freqFromRegister(2047)).toBeCloseTo(131072 / 1, 6);
  });

  test('round-trip register -> freq -> register (allow +/-1)', () => {
    const regs = [0, 1, 10, 100, 512, 1024, 1536, 2046];
    for (const r of regs) {
      const f = freqFromRegister(r);
      const r2 = registerFromFreq(f);
      // Allow off-by-one rounding due to discrete frequency quantization
      expect(Math.abs(r2 - r)).toBeLessThanOrEqual(1);
    }
  });

  test('registerFromFreq clamps and handles invalid', () => {
    expect(registerFromFreq(-10)).toBe(0);
    expect(registerFromFreq(Number.POSITIVE_INFINITY)).toBe(0);
    // very high freq should clamp to near-max reg
    expect(registerFromFreq(1e6)).toBeGreaterThanOrEqual(2047 - 5);
  });
});
