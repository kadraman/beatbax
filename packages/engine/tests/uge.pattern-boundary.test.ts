import { buildUGE } from '../src/export/ugeWriter';
import { parseUGE } from '../src/import/uge/uge.reader';
import type { PatternCell, UGESong } from '../src/import/uge/uge.reader';
import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';

const LEAD = 'inst lead type=pulse1 duty=50 env={"level":10,"direction":"down","period":1,"format":"gb"}';

function exportParsed(src: string): UGESong {
  const song = resolveSong(parse(src) as any);
  return parseUGE(Buffer.from(buildUGE(song)));
}

function duty1Row(uge: UGESong, orderIdx: number, row: number): PatternCell {
  const patIdx = uge.orders.duty1[orderIdx];
  const pattern = uge.patterns.find((p) => p.index === patIdx);
  if (!pattern) {
    throw new Error(`duty1 order ${orderIdx} pattern ${patIdx} not found`);
  }
  return pattern.rows[row];
}

function isE00(cell: PatternCell): boolean {
  return cell.effectCode === 0xE && cell.effectParam === 0x00;
}

describe('UGE export — pattern-boundary auto-cut', () => {
  test('does not E00 row 63 when the next 64-row pattern or song loop continues', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
pat a = C5:16
pat b = E5:16
seq s = a a a a b b b b
channel 1 => inst lead seq s
play auto repeat
`);

    expect(uge.orders.duty1.length).toBeGreaterThanOrEqual(2);
    expect(isE00(duty1Row(uge, 0, 63))).toBe(false);
    expect(isE00(duty1Row(uge, 1, 63))).toBe(false);
  });

  test('still E00s the last sounding row of a short pattern padded to 64', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
pat p = C5:16
channel 1 => inst lead pat p
`);

    expect(isE00(duty1Row(uge, 0, 15))).toBe(true);
    const padRow = duty1Row(uge, 0, 16);
    expect(padRow.note).toBe(90);
    expect(padRow.effectCode).toBe(0);
  });

  test('E00s row 63 of a full 64-row one-shot with no repeat', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
pat p = C5:16
seq s = p p p p
channel 1 => inst lead seq s
`);

    expect(isE00(duty1Row(uge, 0, 63))).toBe(true);
  });

  test('still writes E00 on an authored rest after a note', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
pat p = C5:4 . . . .
channel 1 => inst lead pat p
`);

    expect(isE00(duty1Row(uge, 0, 4))).toBe(true);
  });
});
