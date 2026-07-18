import { PULSE_OUTPUT_GAIN } from '../../src/chips/gameboy/pulse';

describe('Game Boy pulse output gain', () => {
  test('PULSE_OUTPUT_GAIN is calibrated below unity for hUGE parity', () => {
    expect(PULSE_OUTPUT_GAIN).toBe(0.25);
    expect(PULSE_OUTPUT_GAIN).toBeGreaterThan(0.2);
    expect(PULSE_OUTPUT_GAIN).toBeLessThan(0.35);
  });
});
