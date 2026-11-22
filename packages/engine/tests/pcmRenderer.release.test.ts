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

describe('PCM FR-011 releases', () => {
  test('pulse keeps a 5 ms tail after the nominal end', () => {
    const src = `
chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=gb:15,flat
pat p = C4:4
channel 1 => inst lead pat p
`;
    const song = resolveSong(parse(src));
    const sr = 44100;
    const buf = renderSongToPCM(song, { sampleRate: sr, channels: 1, bpm: 120 });
    const end = Math.round(4 * ((60 / 120) / 4) * sr);
    const body = rms(buf, end - Math.round(0.01 * sr), end);
    const tail = rms(buf, end + Math.round(0.001 * sr), end + Math.round(0.004 * sr));
    const after = rms(buf, end + Math.round(0.008 * sr), end + Math.round(0.02 * sr));
    expect(body).toBeGreaterThan(0.05);
    expect(tail).toBeGreaterThan(body * 0.05);
    expect(tail).toBeLessThan(body * 0.85);
    expect(after).toBeLessThan(body * 0.05);
  });

  test('wave without a GB envelope fades before the end and rings past it', () => {
    const src = `
chip gameboy
bpm 120
inst bass type=wave volume=100 wave=[0,2,4,6,8,10,12,14,15,14,12,10,8,6,4,2]
pat p = C3:8
channel 3 => inst bass pat p
`;
    const song = resolveSong(parse(src));
    const sr = 44100;
    const buf = renderSongToPCM(song, { sampleRate: sr, channels: 1, bpm: 120 });
    const tick = (60 / 120) / 4;
    const end = Math.round(8 * tick * sr);
    const mid = rms(buf, Math.round(0.2 * sr), Math.round(0.3 * sr));
    const preEnd = rms(buf, end - Math.round(0.01 * sr), end);
    const tail = rms(buf, end + Math.round(0.002 * sr), end + Math.round(0.012 * sr));
    const after = rms(buf, end + Math.round(0.03 * sr), end + Math.round(0.05 * sr));
    expect(mid).toBeGreaterThan(0.02);
    expect(preEnd).toBeLessThan(mid * 0.75);
    expect(tail).toBeGreaterThan(mid * 0.02);
    expect(after).toBeLessThan(mid * 0.02);
  });
});
