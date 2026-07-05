/**
 * Regression tests for gb_uge_note_demo.bax — UGE export + uge_note playback parity.
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
const DEMO_BAX = join(REPO_ROOT, 'songs/gameboy/instruments/gb_uge_note_demo.bax');
const HUGE_REF_WAV = join(REPO_ROOT, 'songs/gameboy/instruments/gb_uge_note_demo_from_hugetracker.wav');

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

function loadMonoWavPeakGrid(wavPath: string, bpm: number, rows: number): number[] {
  const buf = readFileSync(wavPath);
  const rate = buf.readUInt32LE(24);
  let pos = 12;
  let data: Buffer | null = null;
  while (pos < buf.length - 8) {
    const id = buf.toString('ascii', pos, pos + 4);
    const sz = buf.readUInt32LE(pos + 4);
    pos += 8;
    if (id === 'data') data = buf.slice(pos, pos + sz);
    pos += sz + (sz % 2);
  }
  if (!data) return [];
  const n = data.length / 2;
  const peaks: number[] = [];
  for (let row = 0; row < rows; row++) {
    const t0 = row * (60 / bpm / 4);
    const i0 = Math.floor(t0 * rate);
    const i1 = Math.floor((t0 + (60 / bpm / 4) * 0.9) * rate);
    let peak = 0;
    for (let i = i0; i < i1 && i < n; i++) {
      peak = Math.max(peak, Math.abs(data.readInt16LE(i * 2) / 32768));
    }
    peaks.push(peak);
  }
  return peaks;
}

describe('gb_uge_note_demo.bax', () => {
  test('source file exists', () => {
    expect(existsSync(DEMO_BAX)).toBe(true);
  });

  test('instruments derive hUGEDriver-compatible NR43 clocks from uge_note', () => {
    const song = loadDemoSong();
    expect(resolveNoiseClock(song.insts.kick as any)).toEqual({
      shift: 5,
      divisor: 7,
      nr43: 0x5f,
    });
    expect(resolveNoiseClock(song.insts.snare as any)).toEqual({
      shift: 2,
      divisor: 7,
      nr43: 0x27,
    });
    expect(resolveNoiseClock(song.insts.closed_hat as any)).toEqual({
      shift: 0,
      divisor: 3,
      nr43: 0x03,
    });
    expect(resolveNoiseClock(song.insts.open_hat as any)).toEqual({
      shift: 0,
      divisor: 1,
      nr43: 0x01,
    });
  });

  test('UGE export writes expected noise pattern notes and instrument slots', () => {
    const song = loadDemoSong();
    const uge = parseUGE(Buffer.from(buildUGE(song)));

    const rows = noisePatternRows(uge, 8);
    expect(rows.map((r) => r.note)).toEqual([36, 60, 60, 62, 36, 60, 60, 62]);
    expect(rows.map((r) => r.instrument)).toEqual([1, 4, 4, 3, 1, 4, 4, 3]);

    const [kick, snare, openHat, closedHat] = uge.noiseInstruments;
    expect(kick.name).toBe('kick');
    expect(kick.initialVolume).toBe(14);
    expect(kick.length).toBe(16);
    expect(snare.name).toBe('snare');
    expect(snare.initialVolume).toBe(10);
    expect(snare.volumeSweepChange).toBe(2);
    expect(openHat.name).toBe('open_hat');
    expect(openHat.initialVolume).toBe(4);
    expect(openHat.length).toBe(32);
    expect(closedHat.name).toBe('closed_hat');
    expect(closedHat.initialVolume).toBe(4);
    expect(closedHat.length).toBe(8);
  });

  test('PCM render produces audible kick, snare, and hat hits', () => {
    const song = loadDemoSong();
    const samples = renderSongToPCM(song, {
      sampleRate: 44100,
      channels: 1,
      bpm: 128,
      normalize: false,
    });

    const kickPeak = peakInWindow(samples, 44100, 128, 0);
    const closedHatPeak = peakInWindow(samples, 44100, 128, 1);
    const snarePeak = peakInWindow(samples, 44100, 128, 10);

    expect(kickPeak).toBeGreaterThan(0.05);
    expect(closedHatPeak).toBeGreaterThan(0.05);
    expect(snarePeak).toBeGreaterThan(0.05);
  });

  test('reference hUGETracker WAV has audible kick on grid', () => {
    if (!existsSync(HUGE_REF_WAV)) {
      return;
    }
    const peaks = loadMonoWavPeakGrid(HUGE_REF_WAV, 128, 4);
    expect(peaks[0]).toBeGreaterThan(0.1);
  });
});

describe('gb_uge_note_demo.bax export file round-trip', () => {
  test('exportUGE writes a readable file', async () => {
    const out = join(tmpdir(), 'gb_uge_note_demo_test.uge');
    const song = loadDemoSong();
    await exportUGE(song, out, { debug: false });
    const uge = parseUGE(readFileSync(out));
    expect(uge.orders.noise.length).toBeGreaterThan(0);
    expect(noisePatternRows(uge, 4).map((r) => r.note)).toEqual([36, 60, 60, 62]);
  });
});
