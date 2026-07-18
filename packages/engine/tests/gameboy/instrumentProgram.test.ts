import {
  encodeTickProgramToUgeRows,
  HUGE_EFFECT_SET_VOLUME,
  HUGE_SUBPAT_OFFSET_ZERO_NOTE,
  lowerGameBoyInstrumentProgram,
  offsetToUgeNote,
  tickRowAtTime,
  tickRowVolume,
  ugeNoteToOffset,
} from '../../src/chips/gameboy/instrumentProgram';
import { UGE_EMPTY_NOTE } from '../../src/chips/gameboy/noiseNote';

describe('lowerGameBoyInstrumentProgram', () => {
  test('empty instrument → disabled program', () => {
    const prog = lowerGameBoyInstrumentProgram({});
    expect(prog.enabled).toBe(false);
    expect(prog.rows).toEqual([]);
    expect(prog.errors).toEqual([]);
  });

  test('pitch_env one-shot → offsets + silence halt row', () => {
    const prog = lowerGameBoyInstrumentProgram({
      pitch_env: [0, -2, -4, -6],
    });
    expect(prog.enabled).toBe(true);
    expect(prog.rows.map((r) => r.offset)).toEqual([0, -2, -4, -6, -6]);
    expect(prog.rows[3].halt).toBeFalsy();
    expect(prog.rows[4].halt).toBe(true);
    expect(prog.rows[4].effect).toEqual({ code: HUGE_EFFECT_SET_VOLUME, param: 0 });
  });

  test('vol_env → Cxy effects + silence halt (does not freeze on last audible vol)', () => {
    const prog = lowerGameBoyInstrumentProgram({
      vol_env: [15, 12, 8, 4],
    });
    expect(prog.enabled).toBe(true);
    expect(prog.rows).toHaveLength(5);
    expect(prog.rows.slice(0, 4).map((r) => r.effect)).toEqual([
      { code: HUGE_EFFECT_SET_VOLUME, param: 15 },
      { code: HUGE_EFFECT_SET_VOLUME, param: 12 },
      { code: HUGE_EFFECT_SET_VOLUME, param: 8 },
      { code: HUGE_EFFECT_SET_VOLUME, param: 4 },
    ]);
    expect(prog.rows[4].effect).toEqual({ code: HUGE_EFFECT_SET_VOLUME, param: 0 });
    expect(prog.rows[4].halt).toBe(true);
  });

  test('vol_env ending in 0 halts on that row (no extra silence row)', () => {
    const prog = lowerGameBoyInstrumentProgram({
      vol_env: [15, 8, 0],
    });
    expect(prog.rows).toHaveLength(3);
    expect(prog.rows[2].effect?.param).toBe(0);
    expect(prog.rows[2].halt).toBe(true);
  });

  test('zip uneven lanes: hold pitch, omit missing volume, then silence halt', () => {
    const prog = lowerGameBoyInstrumentProgram({
      pitch_env: [0, -2],
      vol_env: [15, 12, 8, 4],
    });
    expect(prog.rows).toHaveLength(5);
    expect(prog.rows.map((r) => r.offset)).toEqual([0, -2, -2, -2, -2]);
    expect(prog.rows[0].effect?.param).toBe(15);
    expect(prog.rows[3].effect?.param).toBe(4);
    expect(prog.rows[4].effect?.param).toBe(0);
    expect(prog.rows[4].halt).toBe(true);
  });

  test('zip longer pitch than vol: omit volume after vol ends, then silence halt', () => {
    const prog = lowerGameBoyInstrumentProgram({
      pitch_env: [0, -1, -2, -3],
      vol_env: [15, 8],
    });
    expect(prog.rows).toHaveLength(5);
    expect(prog.rows[0].effect?.param).toBe(15);
    expect(prog.rows[1].effect?.param).toBe(8);
    expect(prog.rows[2].effect).toBeUndefined();
    expect(prog.rows[3].effect).toBeUndefined();
    expect(prog.rows[4].effect?.param).toBe(0);
    expect(prog.rows[4].halt).toBe(true);
  });

  test('loop point encodes 1-based jump on last row', () => {
    const prog = lowerGameBoyInstrumentProgram({
      pitch_env: '[0,4,7|0]',
    });
    expect(prog.rows).toHaveLength(3);
    expect(prog.rows[2].halt).toBeFalsy();
    expect(prog.rows[2].jump).toBe(1); // 0-based loop → 1-based
  });

  test('>64 ticks → error and disabled', () => {
    const values = Array.from({ length: 65 }, (_, i) => i);
    const prog = lowerGameBoyInstrumentProgram({ pitch_env: values }, { name: 'kick' });
    expect(prog.enabled).toBe(false);
    expect(prog.errors.some((e) => e.includes('65 ticks'))).toBe(true);
  });

  test('duty_env / arp_env warn but do not block', () => {
    const prog = lowerGameBoyInstrumentProgram({
      pitch_env: [0, -1],
      duty_env: [2, 1],
      arp_env: [0, 4, 7],
    });
    expect(prog.enabled).toBe(true);
    expect(prog.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe('encodeTickProgramToUgeRows', () => {
  test('pads to 64 and encodes silence halt as self-jump', () => {
    const prog = lowerGameBoyInstrumentProgram({
      pitch_env: [0, -2],
      vol_env: [15, 8],
    });
    const cells = encodeTickProgramToUgeRows(prog);
    expect(cells).toHaveLength(64);
    expect(cells[0].note).toBe(HUGE_SUBPAT_OFFSET_ZERO_NOTE);
    expect(cells[0].effectCode).toBe(HUGE_EFFECT_SET_VOLUME);
    expect(cells[0].effectParam).toBe(15);
    expect(cells[0].jump).toBe(0);

    expect(cells[1].note).toBe(HUGE_SUBPAT_OFFSET_ZERO_NOTE - 2);
    expect(cells[1].effectParam).toBe(8);
    expect(cells[1].jump).toBe(0);

    // Appended silence + halt
    expect(cells[2].effectParam).toBe(0);
    expect(cells[2].jump).toBe(3); // self-jump on row index 2

    expect(cells[3].note).toBe(UGE_EMPTY_NOTE);
    expect(cells[3].jump).toBe(0);
  });

  test('disabled program writes empty rows', () => {
    const cells = encodeTickProgramToUgeRows({
      enabled: false,
      rows: [],
      errors: [],
      warnings: [],
    });
    expect(cells.every((c) => c.note === UGE_EMPTY_NOTE && c.jump === 0)).toBe(true);
  });
});

describe('offset note packing', () => {
  test('C-6 is +0', () => {
    expect(offsetToUgeNote(0)).toBe(36);
    expect(ugeNoteToOffset(36)).toBe(0);
    expect(ugeNoteToOffset(24)).toBe(-12);
    expect(ugeNoteToOffset(UGE_EMPTY_NOTE)).toBeNull();
  });
});

describe('tickRowAtTime', () => {
  test('advances one row per tick and freezes on silence halt', () => {
    const prog = lowerGameBoyInstrumentProgram({
      pitch_env: [0, -2, -4],
      vol_env: [15, 12, 4],
    });
    expect(tickRowAtTime(prog, 0)?.offset).toBe(0);
    expect(tickRowVolume(tickRowAtTime(prog, 0))).toBe(15);
    expect(tickRowAtTime(prog, 1 / 60)?.offset).toBe(-2);
    expect(tickRowAtTime(prog, 2 / 60)?.offset).toBe(-4);
    expect(tickRowVolume(tickRowAtTime(prog, 2 / 60))).toBe(4);
    // Silence halt row, then freeze there
    expect(tickRowVolume(tickRowAtTime(prog, 3 / 60))).toBe(0);
    expect(tickRowVolume(tickRowAtTime(prog, 1))).toBe(0);
  });
});
