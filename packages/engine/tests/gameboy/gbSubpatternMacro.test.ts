/**
 * Integration: macros → TickProgram → UGE subpattern rows → reader round-trip.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from '../../src/parser/index';
import { resolveSong } from '../../src/song/resolver';
import { buildUGE } from '../../src/export/ugeWriter';
import { parseUGE } from '../../src/import/uge/uge.reader';
import {
  encodeTickProgramToUgeRows,
  HUGE_EFFECT_SET_VOLUME,
  HUGE_SUBPAT_OFFSET_ZERO_NOTE,
  lowerGameBoyInstrumentProgram,
} from '../../src/chips/gameboy/instrumentProgram';
import { renderSongToPCM } from '../../src/audio/pcmRenderer';

const REPO_ROOT = join(__dirname, '../../../..');
const DEMO_BAX = join(REPO_ROOT, 'songs/gameboy/instruments/gb_subpattern_macro_demo.bax');

function loadDemoSong() {
  const src = readFileSync(DEMO_BAX, 'utf8');
  return resolveSong(parse(src) as any);
}

describe('gb_subpattern_macro_demo.bax', () => {
  test('source file exists', () => {
    expect(existsSync(DEMO_BAX)).toBe(true);
  });

  test('kick lowers to expected tick program', () => {
    const song = loadDemoSong();
    const prog = lowerGameBoyInstrumentProgram(song.insts.kick as any, { name: 'kick' });
    expect(prog.enabled).toBe(true);
    expect(prog.errors).toEqual([]);
    expect(prog.rows.map((r) => r.offset)).toEqual([0, -2, -4, -6, -6]);
    expect(prog.rows.map((r) => r.effect?.param)).toEqual([15, 12, 8, 4, 0]);
    expect(prog.rows[3].halt).toBeFalsy();
    expect(prog.rows[4].halt).toBe(true);
  });

  test('UGE export enables noise subpatterns and round-trips rows', () => {
    const song = loadDemoSong();
    const buf = Buffer.from(buildUGE(song));
    const uge = parseUGE(buf);

    const kick = uge.noiseInstruments.find((n) => n.name === 'kick');
    expect(kick).toBeDefined();
    expect(kick!.subpatternEnabled).toBe(true);
    expect(kick!.rows).toBeDefined();
    expect(kick!.rows!.length).toBe(64);

    const expected = encodeTickProgramToUgeRows(
      lowerGameBoyInstrumentProgram(song.insts.kick as any, { name: 'kick' }),
    );

    for (let i = 0; i < 5; i++) {
      expect(kick!.rows![i].note).toBe(expected[i].note);
      expect(kick!.rows![i].jump).toBe(expected[i].jump);
      expect(kick!.rows![i].effectCode).toBe(expected[i].effectCode);
      expect(kick!.rows![i].effectParam).toBe(expected[i].effectParam);
    }

    expect(kick!.rows![0].note).toBe(HUGE_SUBPAT_OFFSET_ZERO_NOTE);
    expect(kick!.rows![0].effectCode).toBe(HUGE_EFFECT_SET_VOLUME);
    expect(kick!.rows![0].effectParam).toBe(15);
    expect(kick!.rows![3].effectParam).toBe(4);
    expect(kick!.rows![3].jump).toBe(0);
    expect(kick!.rows![4].effectParam).toBe(0);
    expect(kick!.rows![4].jump).toBe(5); // silence + self-jump on row index 4
    expect(kick!.rows![5].note).toBe(90);
  });

  test('hat vol_env-only program exports with offsets at +0 and silence halt', () => {
    const song = loadDemoSong();
    const buf = Buffer.from(buildUGE(song));
    const uge = parseUGE(buf);
    const hat = uge.noiseInstruments.find((n) => n.name === 'hat');
    expect(hat?.subpatternEnabled).toBe(true);
    expect(hat!.rows![0].note).toBe(HUGE_SUBPAT_OFFSET_ZERO_NOTE);
    expect(hat!.rows![0].effectParam).toBe(5);
    expect(hat!.rows![1].effectParam).toBe(2);
    expect(hat!.rows![1].jump).toBe(0);
    expect(hat!.rows![2].effectParam).toBe(0);
    expect(hat!.rows![2].jump).toBe(3);
  });

  test('PCM render produces audible energy', () => {
    const song = loadDemoSong();
    const samples = renderSongToPCM(song, { sampleRate: 22050 });
    expect(samples.length).toBeGreaterThan(1000);
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    expect(peak).toBeGreaterThan(0.01);
  });
});
