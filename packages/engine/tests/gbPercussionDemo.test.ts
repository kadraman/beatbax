/**
 * Regression tests for gb_percussion_demo.bax — uge_note noise playback + UGE export.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';
import { buildUGE, exportUGE } from '../src/export/ugeWriter';
import { parseUGE } from '../src/import/uge/uge.reader';
import { renderSongToPCM } from '../src/audio/pcmRenderer';
import { resolveNoiseClock } from '../src/chips/gameboy/noiseNote';

const REPO_ROOT = join(__dirname, '../../..');
const DEMO_BAX = join(REPO_ROOT, 'songs/gameboy/instruments/gb_percussion_demo.bax');

function loadDemoSong() {
  const src = readFileSync(DEMO_BAX, 'utf8');
  return resolveSong(parse(src) as any);
}

function noisePatternRows(uge: ReturnType<typeof parseUGE>, count = 8) {
  const patternIndex = uge.orders.noise[0];
  const pattern = uge.patterns.find((p) => p.index === patternIndex);
  if (!pattern) throw new Error(`Noise pattern ${patternIndex} not found`);
  return pattern.rows.slice(0, count);
}

function peakInWindow(samples: Float32Array, sampleRate: number, bpm: number, row: number): number {
  const tick = 60 / bpm / 4;
  const i0 = Math.floor(row * tick * sampleRate);
  const i1 = Math.floor((row + tick * 0.9) * sampleRate);
  let peak = 0;
  for (let i = i0; i < i1 && i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  return peak;
}

describe('gb_percussion_demo.bax', () => {
  test('source file exists', () => {
    expect(existsSync(DEMO_BAX)).toBe(true);
  });

  test('noise instruments derive NR43 clocks from uge_note', () => {
    const song = loadDemoSong();
    expect(resolveNoiseClock(song.insts.snare_tight as any)).toEqual({
      shift: 5,
      divisor: 7,
      nr43: 0x5f,
    });
    expect(resolveNoiseClock(song.insts.hihat_closed as any)).toEqual({
      shift: 2,
      divisor: 7,
      nr43: 0x27,
    });
    expect(resolveNoiseClock(song.insts.hihat_open as any)).toEqual({
      shift: 2,
      divisor: 5,
      nr43: 0x25,
    });
    expect(resolveNoiseClock(song.insts.tom_high as any)).toEqual({
      shift: 4,
      divisor: 7,
      nr43: 0x4f,
    });
  });

  test('UGE export writes uge_note indices for named snare and hat hits', () => {
    const song = loadDemoSong();
    const uge = parseUGE(Buffer.from(buildUGE(song)));
    const rows = noisePatternRows(uge, 8);

    // snare_backbeat_pat: snares on rows 4 and 12 of first pattern — first 8 rows are rests then snare at row 4
    expect(rows[4]?.note).toBe(36); // C-6 snare_tight
    expect(rows[4]?.instrument).toBeGreaterThan(0);

    const hhPatternIndex = uge.orders.noise[1];
    const hhPattern = uge.patterns.find((p) => p.index === hhPatternIndex);
    expect(hhPattern).toBeDefined();
    const hhRows = hhPattern!.rows.slice(0, 8);
    expect(hhRows.map((r) => r.note)).toEqual([48, 48, 48, 48, 48, 48, 48, 48]); // hihat_pedal C-7
  });

  test('PCM render produces audible snare and hi-hat hits', () => {
    const song = loadDemoSong();
    const samples = renderSongToPCM(song, {
      sampleRate: 44100,
      channels: 1,
      bpm: 140,
      normalize: false,
    });

    const snarePeak = peakInWindow(samples, 44100, 140, 4);
    const hatPeak = peakInWindow(samples, 44100, 140, 32);

    expect(snarePeak).toBeGreaterThan(0.05);
    expect(hatPeak).toBeGreaterThan(0.05);
  });
});

describe('gb_percussion_demo.bax export round-trip', () => {
  test('exportUGE writes a readable file', async () => {
    const out = join(tmpdir(), 'gb_percussion_demo_test.uge');
    const song = loadDemoSong();
    await exportUGE(song, out, { debug: false });
    const uge = parseUGE(readFileSync(out));
    expect(uge.orders.noise.length).toBeGreaterThan(0);
    expect(uge.noiseInstruments.some((i) => i.name === 'snare_tight')).toBe(true);
  });
});
