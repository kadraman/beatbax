import {
  applyTickOffsetToFreq,
  buildTickProgramTimeline,
  clampTickOffset,
  createTickProgramCursor,
  encodeTickProgramToUgeRows,
  HUGE_EFFECT_CHANGE_TIMBRE,
  HUGE_EFFECT_SET_VOLUME,
  HUGE_SUBPAT_OFFSET_ZERO_NOTE,
  HUGE_TICK_SEC,
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

  test('duty_env lowers to 9xx; vol_env wins on collision', () => {
    const prog = lowerGameBoyInstrumentProgram({
      duty_env: [2, 1],
    });
    expect(prog.enabled).toBe(true);
    expect(prog.rows[0].effect?.code).toBe(HUGE_EFFECT_CHANGE_TIMBRE);
    expect(prog.rows[0].effect?.param).toBe((2 & 0x3) << 6);

    const collide = lowerGameBoyInstrumentProgram({
      pitch_env: [0, -1],
      duty_env: [2, 1],
      vol_env: [15, 8],
      arp_env: [0, 4, 7],
    });
    expect(collide.enabled).toBe(true);
    expect(collide.warnings.some((w) => w.includes('arp_env'))).toBe(true);
    expect(collide.warnings.some((w) => w.includes('vol_env wins'))).toBe(true);
    expect(collide.rows[0].effect?.code).toBe(HUGE_EFFECT_SET_VOLUME);
  });

  test('arp_env used when pitch_env absent', () => {
    const prog = lowerGameBoyInstrumentProgram({
      arp_env: [0, 4, 7],
    });
    expect(prog.rows.map((r) => r.offset)).toEqual([0, 4, 7, 7]);
    expect(prog.rows[3].halt).toBe(true);
  });

  test('native subpat: empty row, mid jump, bare halt', () => {
    const prog = lowerGameBoyInstrumentProgram({
      subpatRows: [
        { empty: true },
        { offset: -10, jump: 3 },
        { offset: -31 },
        { offset: -31 },
        { offset: -31 },
        { halt: true },
      ],
    });
    expect(prog.enabled).toBe(true);
    expect(prog.rows.map((r) => r.offset)).toEqual([null, -10, -31, -31, -31]);
    expect(prog.rows[1].jump).toBe(3);
    expect(prog.rows[4].halt).toBe(true);
  });

  test('native subpat: out-of-range jump clamped with warning', () => {
    const prog = lowerGameBoyInstrumentProgram(
      {
        subpatRows: [
          { offset: 0, vol: 15 },
          { offset: -2, vol: 12, jump: 99 },
          { offset: -4, vol: 8 },
          { halt: true }, // bare halt merges onto previous row → 3 rows
        ],
      },
      { name: 'kick' },
    );
    expect(prog.rows).toHaveLength(3);
    expect(prog.rows[1].jump).toBe(3); // 1-based max = row count
    expect(prog.warnings.some((w) => w.includes('jump:99') && w.includes('clamped to 3'))).toBe(
      true,
    );
    const cells = encodeTickProgramToUgeRows(prog);
    expect(cells[1].jump).toBe(3);
  });

  test('native subpat: jump past author rows is valid after silence-halt append', () => {
    // 3 author rows, no halt → silence halt becomes row 4; jump:4 stays.
    const prog = lowerGameBoyInstrumentProgram({
      subpatRows: [
        { offset: 0, vol: 15 },
        { offset: -2, vol: 12, jump: 4 },
        { offset: -4, vol: 8 },
      ],
    });
    expect(prog.rows).toHaveLength(4);
    expect(prog.rows[1].jump).toBe(4);
    expect(prog.warnings.some((w) => w.includes('jump:'))).toBe(false);
  });

  test('subpatRows wins over macros (warning)', () => {
    const prog = lowerGameBoyInstrumentProgram({
      pitch_env: [0, -2],
      subpatRows: [{ offset: 0, vol: 15 }, { halt: true }],
    });
    expect(prog.rows).toHaveLength(1);
    expect(prog.rows[0].effect?.param).toBe(15);
    expect(prog.rows[0].halt).toBe(true);
    expect(prog.warnings.some((w) => w.includes('ignored'))).toBe(true);
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

  test('offsets clamp to UGE note range 0–72 (±36 from C-6)', () => {
    expect(clampTickOffset(50)).toBe(36);
    expect(clampTickOffset(-50)).toBe(-36);
    expect(offsetToUgeNote(50)).toBe(72);
    expect(offsetToUgeNote(-50)).toBe(0);
    expect(ugeNoteToOffset(offsetToUgeNote(50))).toBe(36);
    expect(ugeNoteToOffset(offsetToUgeNote(-50))).toBe(-36);
  });

  test('applyTickOffsetToFreq uses the same clamp as UGE packing', () => {
    const base = 440;
    expect(applyTickOffsetToFreq(base, 12)).toBeCloseTo(base * 2, 5);
    expect(applyTickOffsetToFreq(base, 50)).toBeCloseTo(base * Math.pow(2, 36 / 12), 5);
    expect(applyTickOffsetToFreq(base, -50)).toBeCloseTo(base * Math.pow(2, -36 / 12), 5);
    expect(applyTickOffsetToFreq(base, 50)).toBeCloseTo(
      applyTickOffsetToFreq(base, ugeNoteToOffset(offsetToUgeNote(50))),
      5,
    );
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

  test('halt freeze stays O(1)-stable for long held notes', () => {
    const prog = lowerGameBoyInstrumentProgram({
      pitch_env: [0, -2],
      vol_env: [15, 8],
    });
    const tl = buildTickProgramTimeline(prog);
    expect(tl.freeze).toBeDefined();
    expect(tl.cycle).toBeUndefined();
    // ~60s held note — must match halt row without re-simulating thousands of steps
    expect(tickRowVolume(tickRowAtTime(prog, 3600 * HUGE_TICK_SEC))).toBe(0);
    expect(tickRowAtTime(prog, 3600 * HUGE_TICK_SEC)?.offset).toBe(
      tickRowAtTime(prog, 2 * HUGE_TICK_SEC)?.offset,
    );
  });

  test('looping arp_env timeline cycles without growing', () => {
    const prog = lowerGameBoyInstrumentProgram({
      arp_env: '[0,4,7|0]',
    });
    const tl = buildTickProgramTimeline(prog);
    expect(tl.freeze).toBeUndefined();
    expect(tl.cycle?.map((r) => r.offset)).toEqual([0, 4, 7]);
    expect(tickRowAtTime(prog, 0)?.offset).toBe(0);
    expect(tickRowAtTime(prog, 1 * HUGE_TICK_SEC)?.offset).toBe(4);
    expect(tickRowAtTime(prog, 2 * HUGE_TICK_SEC)?.offset).toBe(7);
    expect(tickRowAtTime(prog, 3 * HUGE_TICK_SEC)?.offset).toBe(0);
    expect(tickRowAtTime(prog, 100 * HUGE_TICK_SEC)?.offset).toBe(
      tickRowAtTime(prog, (100 % 3) * HUGE_TICK_SEC)?.offset,
    );
  });

  test('createTickProgramCursor advances sequentially', () => {
    const prog = lowerGameBoyInstrumentProgram({
      pitch_env: [0, -2, -4],
    });
    const cursor = createTickProgramCursor(prog);
    expect(cursor.advance()?.offset).toBe(0);
    expect(cursor.tick).toBe(0);
    expect(cursor.advance()?.offset).toBe(-2);
    expect(cursor.rowAt(0)?.offset).toBe(0);
    expect(cursor.tick).toBe(1);
  });
});
