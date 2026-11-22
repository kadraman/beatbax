/**
 * T015 — Chromium WebAudio vs PCM parity for tutorial_groove (spec 112 SC-001).
 *
 * References are captured by:
 *   node packages/engine/scripts/capture-webaudio-ref.mjs --compare
 * and checked in under tests/fixtures/parity/tutorial_groove/.
 *
 * Gate metric: active-region windowed correlation (see parityCompare.ts /
 * research.md). Full-buffer correlation is reported but not gated — pitch-
 * dependent PeriodicWave phase resets destroy it on multi-pitch phrases.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';
import { renderSongToPCM } from '../src/audio/pcmRenderer.js';
import { compareParity, type ParityStats } from '../src/audio/parityCompare.js';
import { peakLimitForPlayback, PLAYBACK_PEAK_CEILING } from '../src/audio/playbackLimiter.js';

const FIXTURE_DIR = join(__dirname, 'fixtures/parity/tutorial_groove');
const SONG = join(__dirname, '../../../songs/gameboy/tutorial_groove.bax');
const SAMPLE_RATE = 44100;
const DURATION_SEC = 8;

function decodeWavInterleaved(path: string): Float32Array {
  const buf = readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 12;
  while (pos < buf.length) {
    const id = String.fromCharCode(buf[pos], buf[pos + 1], buf[pos + 2], buf[pos + 3]);
    const sz = dv.getUint32(pos + 4, true);
    if (id === 'data') {
      const samples = new Float32Array(sz / 2);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = dv.getInt16(pos + 8 + i * 2, true) / 32768;
      }
      return samples;
    }
    pos += 8 + sz + (sz & 1);
  }
  throw new Error(`No data chunk in ${path}`);
}

function renderPcmStem(renderChannels?: number[]): Float32Array {
  const song = resolveSong(parse(readFileSync(SONG, 'utf8')));
  const pcm = renderSongToPCM(song, {
    sampleRate: SAMPLE_RATE,
    channels: 2,
    bpm: 140,
    duration: DURATION_SEC,
    renderChannels,
  });
  peakLimitForPlayback(pcm, PLAYBACK_PEAK_CEILING);
  return pcm;
}

function compareStem(label: string, renderChannels?: number[]): ParityStats {
  const refPath = join(
    FIXTURE_DIR,
    `tutorial_groove-webaudio-${label}.wav`,
  );
  if (!existsSync(refPath)) {
    throw new Error(
      `Missing WebAudio reference ${refPath}. Run: node packages/engine/scripts/capture-webaudio-ref.mjs --compare`,
    );
  }
  const wa = decodeWavInterleaved(refPath);
  const pcm = renderPcmStem(renderChannels);
  return compareParity(wa, pcm, {
    sampleRate: SAMPLE_RATE,
    maxLagMs: 50,
    windowSec: 0.1,
    preprocess: true,
  });
}

describe('tutorial_groove WebAudio↔PCM parity (112 T015)', () => {
  test('fixtures exist', () => {
    expect(existsSync(join(FIXTURE_DIR, 'tutorial_groove-webaudio-full.wav'))).toBe(true);
    for (const ch of [1, 2, 3, 4]) {
      expect(existsSync(join(FIXTURE_DIR, `tutorial_groove-webaudio-ch${ch}.wav`))).toBe(true);
    }
  });

  test('ch3 wave+port windowed correlation ≥ 0.90', () => {
    const s = compareStem('ch3', [3]);
    expect(s.windowedCorrelation).toBeGreaterThanOrEqual(0.90);
  });

  test('ch1 pulse+vib windowed correlation ≥ 0.85', () => {
    const s = compareStem('ch1', [1]);
    expect(s.windowedCorrelation).toBeGreaterThanOrEqual(0.85);
  });

  test('ch2 pulse+arp windowed correlation ≥ 0.70 (residual arp gap)', () => {
    const s = compareStem('ch2', [2]);
    expect(s.windowedCorrelation).toBeGreaterThanOrEqual(0.70);
  });

  test('ch4 noise RMS within 15% (stochastic — not corr-gated)', () => {
    const s = compareStem('ch4', [4]);
    const ratio = s.rmsB > 0 ? s.rmsA / s.rmsB : 0;
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.15);
  });

  test('full mix windowed correlation ≥ 0.65', () => {
    const s = compareStem('full');
    expect(s.windowedCorrelation).toBeGreaterThanOrEqual(0.65);
  });
});
