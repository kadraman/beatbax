import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { buildUGE } from '../src/export/ugeWriter';
import { parseUGE } from '../src/import/uge/uge.reader';
import type { PatternCell, UGESong } from '../src/import/uge/uge.reader';
import { UGE_PATTERN_BREAK_CODE, UGE_PATTERN_BREAK_PARAM } from '../src/export/ugePatterns';
import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';

const LEAD = 'inst lead type=pulse1 duty=50 env={"level":10,"direction":"down","period":1,"format":"gb"}';
const BASS = 'inst bass type=pulse2 duty=25 env={"level":10,"direction":"down","period":1,"format":"gb"}';

function exportParsed(src: string, onWarn?: (message: string) => void): UGESong {
  const song = resolveSong(parse(src) as any);
  return parseUGE(Buffer.from(buildUGE(song, { onWarn })));
}

function duty1Row(uge: UGESong, orderIdx: number, row: number): PatternCell {
  const patIdx = uge.orders.duty1[orderIdx];
  const pattern = uge.patterns.find((p) => p.index === patIdx);
  if (!pattern) throw new Error(`duty1 order ${orderIdx} pattern ${patIdx} not found`);
  return pattern.rows[row];
}

function uniqueOrderIds(order: number[]): number[] {
  return [...new Set(order)];
}

function orderHasBreak(uge: UGESong, orderIdx: number, row: number): boolean {
  const lists = [uge.orders.duty1, uge.orders.duty2, uge.orders.wave, uge.orders.noise];
  for (const list of lists) {
    const patIdx = list[orderIdx];
    const pattern = uge.patterns.find((p) => p.index === patIdx);
    const cell = pattern?.rows[row];
    if (cell && cell.effectCode === UGE_PATTERN_BREAK_CODE && cell.effectParam === UGE_PATTERN_BREAK_PARAM) {
      return true;
    }
  }
  return false;
}

describe('UGE export — pattern reuse', () => {
  test('seq repeats of a 16-row pat share one order ID and use D01', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
pat p = C5:16
seq s = p p p p
channel 1 => inst lead seq s
`);

    expect(uge.orders.duty1).toHaveLength(4);
    expect(uniqueOrderIds(uge.orders.duty1)).toHaveLength(1);
    expect(orderHasBreak(uge, 0, 15)).toBe(true);
    expect(duty1Row(uge, 0, 0).note).not.toBe(90);
    expect(duty1Row(uge, 0, 16).note).toBe(90);
  });

  test('reused 16-row phrases share IDs across the order list', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
pat a = C5:16
pat b = E5:16
seq s = a b a b
channel 1 => inst lead seq s
`);

    expect(uge.orders.duty1).toHaveLength(4);
    expect(uge.orders.duty1[0]).toBe(uge.orders.duty1[2]);
    expect(uge.orders.duty1[1]).toBe(uge.orders.duty1[3]);
    expect(uge.orders.duty1[0]).not.toBe(uge.orders.duty1[1]);
  });

  test('identical 64-row windows share IDs when pattern length is not 16/32/64', () => {
    const warnings: string[] = [];
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 8
${LEAD}
pat p = C5:8
seq s = p * 24
channel 1 => inst lead seq s
`, (msg) => warnings.push(msg));

    expect(uge.orders.duty1).toHaveLength(3);
    expect(uge.orders.duty1[0]).toBe(uge.orders.duty1[1]);
    expect(uge.orders.duty1[2]).not.toBe(uge.orders.duty1[0]);
    expect(warnings.some((w) => /64-row windows/i.test(w))).toBe(true);
  });

  test('seq repeat operator p * 4 shares one 16-row pattern ID', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
pat p = C5:16
seq s = p * 4
channel 1 => inst lead seq s
`);

    expect(uge.orders.duty1).toHaveLength(4);
    expect(uniqueOrderIds(uge.orders.duty1)).toHaveLength(1);
    expect(orderHasBreak(uge, 3, 15)).toBe(true);
  });

  test('nested seq reuses land the way Green Pathway does', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
pat walk_a = C5:16
pat walk_b = D5:16
pat land = E5:16
pat reply_p = G5:16
pat recall = A5:16
seq path = walk_a walk_b
seq mel = path land reply_p land recall land
channel 1 => inst lead seq mel
`);

    expect(uge.orders.duty1).toHaveLength(7);
    expect(uge.orders.duty1[2]).toBe(uge.orders.duty1[4]);
    expect(uge.orders.duty1[4]).toBe(uge.orders.duty1[6]);
    expect(uge.orders.duty1[0]).not.toBe(uge.orders.duty1[2]);
    expect(uge.orders.duty1[1]).not.toBe(uge.orders.duty1[2]);
    expect(orderHasBreak(uge, 2, 15)).toBe(true);
  });

  test('32-row pats share IDs and break at row 31', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
pat p = C5:32
seq s = p p
channel 1 => inst lead seq s
`);

    expect(uge.orders.duty1).toHaveLength(2);
    expect(uge.orders.duty1[0]).toBe(uge.orders.duty1[1]);
    expect(orderHasBreak(uge, 0, 31)).toBe(true);
    expect(duty1Row(uge, 0, 32).note).toBe(90);
  });

  test('mixed channel run lengths fall back to 64-row windows with a warning', () => {
    const warnings: string[] = [];
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
${BASS}
pat a = C5:16
pat b = C3:8
seq s = a a
seq t = b b b b
channel 1 => inst lead seq s
channel 2 => inst bass seq t
`, (msg) => warnings.push(msg));

    expect(uge.orders.duty1).toHaveLength(1);
    expect(uge.orders.duty2).toHaveLength(1);
    expect(warnings.some((w) => /64-row windows/i.test(w))).toBe(true);
    expect(orderHasBreak(uge, 0, 15)).toBe(false);
  });

  test('song-end auto-cut does not split reused 16-row bodies', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
pat p = C5:16
seq s = p p p
channel 1 => inst lead seq s
`);

    expect(uniqueOrderIds(uge.orders.duty1)).toHaveLength(1);
    expect(duty1Row(uge, 0, 15).effectCode).toBe(UGE_PATTERN_BREAK_CODE);
    expect(duty1Row(uge, 2, 15).effectCode).toBe(UGE_PATTERN_BREAK_CODE);
    expect(duty1Row(uge, 2, 15).effectCode).not.toBe(0xE);
  });

  test('authored rest-after-note E00 stays in a reused pattern body', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
pat p = C5:8 . . . . . . . .
seq s = p p
channel 1 => inst lead seq s
`);

    expect(uge.orders.duty1).toHaveLength(2);
    expect(uge.orders.duty1[0]).toBe(uge.orders.duty1[1]);
    expect(duty1Row(uge, 0, 8).effectCode).toBe(0xE);
    expect(duty1Row(uge, 0, 8).effectParam).toBe(0x00);
    expect(duty1Row(uge, 1, 8).effectCode).toBe(0xE);
  });

  test('NR51 8xx on first use does not poison later copies of the same pat', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
inst lead type=pulse1 duty=50 gb:pan=L env={"level":10,"direction":"down","period":1,"format":"gb"}
pat p = C5:16
seq s = p p p
channel 1 => inst lead seq s
`);

    expect(uge.orders.duty1).toHaveLength(3);
    expect(uge.orders.duty1[1]).toBe(uge.orders.duty1[2]);
    expect(uge.orders.duty1[0]).not.toBe(uge.orders.duty1[1]);
    expect(duty1Row(uge, 0, 0).effectCode).toBe(8);
    expect(duty1Row(uge, 1, 0).effectCode).not.toBe(8);
  });

  test('all four channels stay on the same 16-row order grid', () => {
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
${BASS}
pat mel_a = C5:16
pat mel_b = G5:16
pat bass_a = C3:16
pat bass_b = G2:16
seq mel = mel_a mel_b mel_a
seq low = bass_a bass_b bass_a
channel 1 => inst lead seq mel
channel 2 => inst bass seq low
`);

    expect(uge.orders.duty1).toHaveLength(3);
    expect(uge.orders.duty2).toHaveLength(3);
    expect(uge.orders.duty1[0]).toBe(uge.orders.duty1[2]);
    expect(uge.orders.duty2[0]).toBe(uge.orders.duty2[2]);
    expect(orderHasBreak(uge, 1, 15)).toBe(true);
  });

  test('seq :inst() on nested 16-row pats still shares order IDs', () => {
    const warnings: string[] = [];
    const uge = exportParsed(`
chip gameboy
bpm 128
stepsPerBar 16
${LEAD}
${BASS}
pat ha = G3:16
pat hb = D3:16
seq path_h = ha hb
seq harm = path_h:inst(bass) path_h:inst(bass)
channel 2 => inst bass seq harm
`, (msg) => warnings.push(msg));

    expect(warnings.some((w) => /64-row windows/i.test(w))).toBe(false);
    expect(uge.orders.duty2).toHaveLength(4);
    expect(uge.orders.duty2[0]).toBe(uge.orders.duty2[2]);
    expect(uge.orders.duty2[1]).toBe(uge.orders.duty2[3]);
    expect(orderHasBreak(uge, 0, 15)).toBe(true);
  });

  test('green_pathway exports 16-row orders without a flatten warning', () => {
    const songPath = join(__dirname, '../../../packs/gb-adventure-pack/src/green_pathway.bax');
    if (!existsSync(songPath)) return;
    const warnings: string[] = [];
    const song = resolveSong(parse(readFileSync(songPath, 'utf8')) as any, { filename: songPath });
    const uge = parseUGE(Buffer.from(buildUGE(song, { onWarn: (msg) => warnings.push(msg) })));

    expect(warnings.some((w) => /64-row windows/i.test(w))).toBe(false);
    expect(uge.orders.duty1).toHaveLength(24);
    expect(uniqueOrderIds(uge.orders.duty1).length).toBeLessThan(24);
    expect(uge.orders.duty1[6]).toBe(uge.orders.duty1[14]);
    expect(uge.orders.duty1[6]).toBe(uge.orders.duty1[22]);
    expect(orderHasBreak(uge, 0, 15)).toBe(true);
  });
});
