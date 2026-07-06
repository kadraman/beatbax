import {
  applyNoiseWidthToNr43,
  gameBoyNoiseSample,
  getNotePoly,
  hugeTrackerNoteToIndex,
  noiseClockToLfsrHz,
  nr43DivisorCodeToRatio,
  nr43ToShiftDivisor,
  NOISE_OUTPUT_GAIN,
  resolveNoiseClock,
  resolveNoiseHardwareLengthSec,
  resolveNoisePlayDurationSec,
  stepGameBoyLfsr,
  triggerGameBoyLfsr,
} from '../../src/chips/gameboy/noiseNote';

describe('hUGETracker noise note mapping', () => {
  test('hugeTrackerNoteToIndex parses C-6/C-7/C-8', () => {
    expect(hugeTrackerNoteToIndex('C-6')).toBe(36);
    expect(hugeTrackerNoteToIndex('C-7')).toBe(48);
    expect(hugeTrackerNoteToIndex('C-8')).toBe(60);
  });

  test('getNotePoly matches hUGEDriver for reference demo notes', () => {
    expect(getNotePoly(36)).toBe(0x57);
    expect(getNotePoly(48)).toBe(0x27);
    expect(getNotePoly(60)).toBe(0x03);
  });

  test('nr43ToShiftDivisor extracts shift and divisor', () => {
    expect(nr43ToShiftDivisor(0x57)).toEqual({ shift: 5, divisor: 7 });
    expect(nr43ToShiftDivisor(0x27)).toEqual({ shift: 2, divisor: 7 });
    expect(nr43ToShiftDivisor(0x03)).toEqual({ shift: 0, divisor: 3 });
  });

  test('applyNoiseWidthToNr43 sets NR43 bit 3 for 7-bit mode', () => {
    expect(applyNoiseWidthToNr43(0x57, 7)).toBe(0x5f);
    expect(applyNoiseWidthToNr43(0x57, 15)).toBe(0x57);
  });

  test('resolveNoiseClock derives from uge_note for gb_uge_note_demo instruments', () => {
    const kick = resolveNoiseClock({ uge_note: 'C-6', 'gb:width': 7 });
    expect(kick).toEqual({ shift: 5, divisor: 7, nr43: 0x5f });

    const snare = resolveNoiseClock({ uge_note: 'C-7', 'gb:width': 15 });
    expect(snare).toEqual({ shift: 2, divisor: 7, nr43: 0x27 });

    const hat = resolveNoiseClock({ uge_note: 'C-8', 'gb:width': 15 });
    expect(hat).toEqual({ shift: 0, divisor: 3, nr43: 0x03 });
  });

  test('explicit divisor/shift override uge_note', () => {
    const clock = resolveNoiseClock({ uge_note: 'C-8', divisor: 1, shift: 2, width: 15 });
    expect(clock).toEqual({ shift: 2, divisor: 1, nr43: 0x21 });
  });

  test('explicit override allows NR43 divisor code 0', () => {
    const clock = resolveNoiseClock({ divisor: 0, shift: 0, width: 15 });
    expect(clock).toEqual({ shift: 0, divisor: 0, nr43: 0x00 });
    expect(noiseClockToLfsrHz(clock.shift, clock.divisor)).toBeCloseTo(4194304 / 0.5, 1);
  });

  test('explicit shift/divisor clamp to 0–7 and match nr43 bits', () => {
    const clock = resolveNoiseClock({ divisor: 99, shift: -3, width: 7 });
    expect(clock).toEqual({ shift: 0, divisor: 7, nr43: 0x0f });
  });

  test('reference demo clocks differ in LFSR rate', () => {
    const kickHz = noiseClockToLfsrHz(5, 7);
    const snareHz = noiseClockToLfsrHz(2, 7);
    const hatHz = noiseClockToLfsrHz(0, 3);
    expect(kickHz).toBeCloseTo(4194304 / (112 * 32), 1);
    expect(snareHz).toBeCloseTo(4194304 / (112 * 4), 1);
    expect(hatHz).toBeCloseTo(4194304 / 48, 1);
    expect(kickHz).toBeLessThan(snareHz);
    expect(snareHz).toBeLessThan(hatHz);
  });

  test('nr43DivisorCodeToRatio maps hardware divisor codes', () => {
    expect(nr43DivisorCodeToRatio(0)).toBe(0.5);
    expect(nr43DivisorCodeToRatio(3)).toBe(48);
    expect(nr43DivisorCodeToRatio(7)).toBe(112);
  });

  test('resolveNoiseHardwareLengthSec maps NR41 length to seconds', () => {
    expect(resolveNoiseHardwareLengthSec({ length: 16 })).toBeCloseTo(48 / 256, 5);
    expect(resolveNoiseHardwareLengthSec({ length: 8 })).toBeCloseTo(56 / 256, 5);
    expect(resolveNoiseHardwareLengthSec({})).toBeUndefined();
  });

  test('resolveNoisePlayDurationSec extends pattern tick by hardware length', () => {
    const tick = 60 / 128 / 4;
    expect(resolveNoisePlayDurationSec({ length: 16 }, tick)).toBeCloseTo(48 / 256, 5);
    expect(resolveNoisePlayDurationSec({}, tick)).toBeCloseTo(tick, 5);
  });

  test('triggerGameBoyLfsr starts at an audible LFSR state', () => {
    const lfsr = triggerGameBoyLfsr(true);
    expect(lfsr & 1).toBe(1);
  });

  test('stepGameBoyLfsr advances state and gates output bit', () => {
    const s15 = stepGameBoyLfsr(0x1234, false);
    expect(s15).not.toBe(0x1234);
    const s7 = stepGameBoyLfsr(0x1234, true);
    expect(s7).not.toBe(s15);
    expect(gameBoyNoiseSample(1)).toBe(1);
    expect(gameBoyNoiseSample(0)).toBe(-1);
    expect(NOISE_OUTPUT_GAIN).toBeGreaterThan(0);
    expect(NOISE_OUTPUT_GAIN).toBeLessThan(1);
  });
});
