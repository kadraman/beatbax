import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';
import { renderSongToPCM } from '../src/audio/pcmRenderer.js';

function rms(buf: Float32Array, a: number, b: number): number {
  let s = 0;
  let n = 0;
  const end = Math.min(b, buf.length);
  for (let i = Math.max(0, a); i < end; i++) {
    s += buf[i] * buf[i];
    n++;
  }
  return n ? Math.sqrt(s / n) : 0;
}

function peak(buf: Float32Array, a: number, b: number): number {
  let p = 0;
  const end = Math.min(b, buf.length);
  for (let i = Math.max(0, a); i < end; i++) p = Math.max(p, Math.abs(buf[i]));
  return p;
}

describe('PCM volSlide and portamento voice', () => {
  test('a +12 slide from env 4 ends at a full pulse', () => {
    const slide = resolveSong(parse(`
chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=gb:4,flat
pat p = C4<volSlide:+12>:4
channel 1 => inst lead pat p
`));
    const full = resolveSong(parse(`
chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=gb:15,flat
pat p = C4:4
channel 1 => inst lead pat p
`));
    const opts = { sampleRate: 44100, channels: 1 as const, bpm: 120 };
    const slideBuf = renderSongToPCM(slide, opts);
    const fullBuf = renderSongToPCM(full, opts);
    // Quarter note at 120 bpm is 0.5s. Stay clear of the 5ms release.
    const noteEnd = Math.round(0.5 * 44100);
    const endSlide = peak(slideBuf, noteEnd - 2500, noteEnd - 400);
    const endFull = peak(fullBuf, noteEnd - 2500, noteEnd - 400);
    const startSlide = peak(slideBuf, 800, 2500);
    expect(endSlide).toBeGreaterThan(startSlide * 2);
    expect(endSlide).toBeGreaterThan(endFull * 0.75);
    expect(endSlide).toBeLessThan(endFull * 1.25);
  });

  test('a stepped slide moves by tenths of full scale', () => {
    const song = resolveSong(parse(`
chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=gb:0,flat
pat p = C4<volSlide:+4,4>:4
channel 1 => inst lead pat p
`));
    const sr = 44100;
    const buf = renderSongToPCM(song, { sampleRate: sr, channels: 1, bpm: 120 });
    const end = Math.round(4 * ((60 / 120) / 4) * sr);
    const lastStep = peak(buf, end - Math.round(end / 4) + 20, end - 20);
    // Last interior step is 4 × 0.1 × 3/4 = 0.3, then × 0.25 pulse gain.
    expect(lastStep).toBeGreaterThan(0.05);
    expect(lastStep).toBeLessThan(0.12);
  });

  test('a pulse portamento run does not re-attack each note', () => {
    const song = resolveSong(parse(`
chip gameboy
bpm 140
inst lead type=pulse1 duty=50 env=gb:8,up,2
pat p = C4<port:8>:4 C5<port:8>:4
channel 1 => inst lead pat p
`));
    const sr = 44100;
    const buf = renderSongToPCM(song, { sampleRate: sr, channels: 1, bpm: 140 });
    const note = Math.round(4 * ((60 / 140) / 4) * sr);
    const endOfFirst = rms(buf, note - Math.round(0.03 * sr), note - Math.round(0.006 * sr));
    const startOfSecond = rms(buf, note + Math.round(0.001 * sr), note + Math.round(0.03 * sr));
    expect(endOfFirst).toBeGreaterThan(0.02);
    expect(startOfSecond).toBeGreaterThan(endOfFirst * 0.7);
    expect(startOfSecond).toBeLessThan(endOfFirst * 1.4);
  });
});
