/**
 * Native `subpat` parse → resolve → TickProgram → UGE round-trip.
 */

import { parse } from '../../src/parser/index';
import { parseWithPeggy } from '../../src/parser/peggy';
import { resolveSong } from '../../src/song/resolver';
import { buildUGE } from '../../src/export/ugeWriter';
import { parseUGE } from '../../src/import/uge/uge.reader';
import {
  encodeTickProgramToUgeRows,
  HUGE_SUBPAT_OFFSET_ZERO_NOTE,
  lowerGameBoyInstrumentProgram,
} from '../../src/chips/gameboy/instrumentProgram';
import { UGE_EMPTY_NOTE } from '../../src/chips/gameboy/noiseNote';

const SRC = `
chip gameboy
bpm 128

subpat kick_huge =
  .
  -10 jump:3
  -31
  -31
  -31
  halt

inst kick_huge type=noise gb:width=7 uge_note=F-7 subpat=kick_huge
inst lead type=pulse1 duty=50 duty_env=[2,1,0]

pat p = kick_huge
channel 4 => inst kick_huge pat p
play
`;

describe('native subpat authoring', () => {
  test('parser resolves subpat= onto instrument rows', () => {
    const { ast, hasErrors, errors } = parseWithPeggy(SRC);
    expect(hasErrors).toBe(false);
    expect(errors).toEqual([]);
    expect(ast.subpatterns?.kick_huge?.rows).toHaveLength(6);
    expect(ast.subpatterns!.kick_huge.rows[0].empty).toBe(true);
    expect(ast.subpatterns!.kick_huge.rows[1]).toMatchObject({ offset: -10, jump: 3 });
    expect(ast.insts.kick_huge.subpat).toBe('kick_huge');
    expect(ast.insts.kick_huge.subpatRows).toHaveLength(6);
  });

  test('resolved subpat does not emit unresolved validation warnings', () => {
    const demo = `
chip gameboy
bpm 128
subpat kick_huge =
  .
  -10 jump:3
  -31
  halt
inst kick_huge type=noise gb:width=7 uge_note=F-7 subpat=kick_huge
pat p = kick_huge
channel 4 => inst kick_huge pat p
`;
    const { ast, hasErrors } = parseWithPeggy(demo);
    expect(hasErrors).toBe(false);
    const msgs = (ast.diagnostics ?? []).map((d) => d.message);
    expect(msgs.some((m) => /not resolved/i.test(m))).toBe(false);
    expect(msgs.some((m) => /subpat='kick_huge' is not defined/i.test(m))).toBe(false);
  });

  test('one-line subpat parses the same rows', () => {
    const oneLine = `
chip gameboy
bpm 128
subpat body = . -10 jump:3 -31 -31 -31 halt
inst kick type=noise gb:width=7 uge_note=C-6 subpat=body
pat p = kick
channel 4 => inst kick pat p
`;
    const { ast, hasErrors } = parseWithPeggy(oneLine);
    expect(hasErrors).toBe(false);
    const rows = ast.insts.kick.subpatRows!;
    // Trailing `halt` attaches as a prop on the last offset row (not a separate row).
    expect(rows).toHaveLength(5);
    expect(rows[0].empty).toBe(true);
    expect(rows[1]).toMatchObject({ offset: -10, jump: 3 });
    expect(rows[2].offset).toBe(-31);
    expect(rows[4]).toMatchObject({ offset: -31, halt: true });
  });

  test('missing subpat reference is an error diagnostic', () => {
    const bad = `
chip gameboy
inst kick type=noise subpat=missing
pat p = kick
channel 4 => inst kick pat p
`;
    const { ast } = parseWithPeggy(bad);
    expect((ast.diagnostics ?? []).some((d) => /subpat/.test(d.message))).toBe(true);
  });

  test('lowered program preserves empty + jump; UGE round-trips', () => {
    const song = resolveSong(parse(SRC) as any);
    const prog = lowerGameBoyInstrumentProgram(song.insts.kick_huge as any, { name: 'kick_huge' });
    expect(prog.enabled).toBe(true);
    expect(prog.rows.map((r) => r.offset)).toEqual([null, -10, -31, -31, -31]);
    expect(prog.rows[1].jump).toBe(3);
    expect(prog.rows[4].halt).toBe(true);

    const cells = encodeTickProgramToUgeRows(prog);
    expect(cells[0].note).toBe(UGE_EMPTY_NOTE);
    expect(cells[1].note).toBe(HUGE_SUBPAT_OFFSET_ZERO_NOTE - 10);
    expect(cells[1].jump).toBe(3);
    expect(cells[4].jump).toBe(5); // self-jump halt

    const buf = Buffer.from(buildUGE(song));
    const uge = parseUGE(buf);
    const kick = uge.noiseInstruments.find((n) => n.name === 'kick_huge');
    expect(kick?.subpatternEnabled).toBe(true);
    expect(kick!.rows![0].note).toBe(UGE_EMPTY_NOTE);
    expect(kick!.rows![1].jump).toBe(3);
    expect(kick!.rows![4].jump).toBe(5);
  });

  test('duty_env on pulse exports 9xx cells', () => {
    const song = resolveSong(parse(SRC) as any);
    const prog = lowerGameBoyInstrumentProgram(song.insts.lead as any, { name: 'lead' });
    expect(prog.rows.slice(0, 3).map((r) => r.effect?.param)).toEqual([
      (2 & 0x3) << 6,
      (1 & 0x3) << 6,
      (0 & 0x3) << 6,
    ]);
    const buf = Buffer.from(buildUGE(song));
    const uge = parseUGE(buf);
    const lead = uge.dutyInstruments.find((d) => d.name === 'lead');
    expect(lead?.subpatternEnabled).toBe(true);
    expect(lead!.rows![0].effectCode).toBe(0x09);
  });
});
