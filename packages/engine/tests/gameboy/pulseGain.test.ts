import { PULSE_OUTPUT_GAIN } from '../../src/chips/gameboy/pulse';

describe('Game Boy pulse output gain', () => {
  test('PULSE_OUTPUT_GAIN is calibrated below unity for hUGE parity', () => {
    expect(PULSE_OUTPUT_GAIN).toBe(0.5);
    expect(PULSE_OUTPUT_GAIN).toBeGreaterThan(0.4);
    expect(PULSE_OUTPUT_GAIN).toBeLessThan(0.6);
  });
});
