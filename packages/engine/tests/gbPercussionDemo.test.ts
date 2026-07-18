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
const HUGE_WAV = join(REPO_ROOT, 'songs/gameboy/instruments/gb_percussion_demo_from_hugetracker.wav');

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
  const t0 = row * tick;
  const t1 = t0 + tick * 0.9;
  const i0 = Math.floor(t0 * sampleRate);
  const i1 = Math.floor(t1 * sampleRate);
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
    // snare_tight uge_note=C-7; hats C-8 / D-8; tom_high E-6
    expect(resolveNoiseClock(song.insts.snare_tight as any)).toEqual({
      shift: 2,
      divisor: 7,
      nr43: 0x2f,
    });
    expect(resolveNoiseClock(song.insts.hihat_closed as any)).toEqual({
      shift: 0,
      divisor: 3,
      nr43: 0x03,
    });
    expect(resolveNoiseClock(song.insts.hihat_open as any)).toEqual({
      shift: 0,
      divisor: 1,
      nr43: 0x01,
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

    // snare_backbeat_pat: snare on row 4 of first noise pattern
    expect(rows[4]?.note).toBe(48); // C-7 snare_tight
    expect(rows[4]?.instrument).toBeGreaterThan(0);

    const hhPatternIndex = uge.orders.noise[1];
    const hhPattern = uge.patterns.find((p) => p.index === hhPatternIndex);
    expect(hhPattern).toBeDefined();
    const hhRows = hhPattern!.rows.slice(0, 8);
    expect(hhRows.map((r) => r.note)).toEqual([60, 60, 60, 60, 60, 60, 60, 60]); // hihat_pedal C-8
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

describe('gb_percussion_demo.bax hUGETracker WAV parity', () => {
  function scanPeak(samples: Float32Array, sampleRate: number, centerSec: number): number {
    let best = 0;
    for (let dt = -0.03; dt <= 0.03; dt += 0.0005) {
      const i0 = Math.max(0, Math.floor((centerSec + dt) * sampleRate));
      const i1 = Math.min(samples.length, Math.floor((centerSec + dt + 0.012) * sampleRate));
      let peak = 0;
      for (let i = i0; i < i1; i++) peak = Math.max(peak, Math.abs(samples[i]));
      if (peak > best) best = peak;
    }
    return best;
  }

  test('fresh CLI render levels track hUGE reference on kick and snare rows', () => {
    if (!existsSync(HUGE_WAV)) return;

    const song = loadDemoSong();
    const uge = parseUGE(Buffer.from(buildUGE(song)));
    const kickPattern = uge.patterns.find((p) => p.index === uge.orders.duty1[0]);
    const snarePattern = uge.patterns.find((p) => p.index === uge.orders.noise[0]);
    if (!kickPattern || !snarePattern) return;

    const cliSamples = renderSongToPCM(song, {
      sampleRate: 44100,
      channels: 1,
      bpm: 140,
      normalize: false,
    });

    const hugeBuf = readFileSync(HUGE_WAV);
    const hugeRate = hugeBuf.readUInt32LE(24);
    const hugeCh = hugeBuf.readUInt16LE(22);
    let pos = 12;
    let data: Buffer | null = null;
    while (pos < hugeBuf.length - 8) {
      const id = hugeBuf.toString('ascii', pos, pos + 4);
      const sz = hugeBuf.readUInt32LE(pos + 4);
      pos += 8;
      if (id === 'data') data = hugeBuf.slice(pos, pos + sz);
      pos += sz + (sz % 2);
    }
    if (!data) return;

    const hugeSamples = data.length / (hugeCh * 2);
    const rowSec = hugeSamples / hugeRate / 128;
    const hugeMono = new Float32Array(hugeSamples);
    for (let i = 0; i < hugeSamples; i++) {
      let s = 0;
      for (let c = 0; c < hugeCh; c++) s += data.readInt16LE((i * hugeCh + c) * 2) / 32768;
      hugeMono[i] = s / hugeCh;
    }

    const kickRatios: number[] = [];
    for (let row = 0; row < 64; row++) {
      if (kickPattern.rows[row]?.note === 90) continue;
      const t = row * rowSec;
      const h = scanPeak(hugeMono, hugeRate, t);
      const c = scanPeak(cliSamples, 44100, t);
      if (h > 0.05) kickRatios.push(c / h);
    }

    const snareRatios: number[] = [];
    for (let row = 0; row < 64; row++) {
      if (snarePattern.rows[row]?.note === 90) continue;
      const t = row * rowSec;
      const h = scanPeak(hugeMono, hugeRate, t);
      const c = scanPeak(cliSamples, 44100, t);
      if (h > 0.05) snareRatios.push(c / h);
    }

    expect(kickRatios.length).toBeGreaterThan(0);
    expect(snareRatios.length).toBeGreaterThan(0);

    kickRatios.sort((a, b) => a - b);
    snareRatios.sort((a, b) => a - b);
    const kickMedian = kickRatios[Math.floor(kickRatios.length / 2)];
    const snareMedian = snareRatios[Math.floor(snareRatios.length / 2)];

    expect(kickMedian).toBeGreaterThan(0.85);
    expect(kickMedian).toBeLessThan(1.25);
    expect(snareMedian).toBeGreaterThan(0.85);
    expect(snareMedian).toBeLessThan(1.25);
  });
});
