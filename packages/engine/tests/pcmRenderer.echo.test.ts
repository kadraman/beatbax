import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';
import { renderSongToPCM } from '../src/audio/pcmRenderer.js';

describe('pcmRenderer echo/retrig (112)', () => {
  test('echo produces energy after the dry note region', () => {
    const src = `
chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=gb:15,down,0
pat p = C4<echo:0.25,50,40>:8
channel 1 => inst lead pat p
play
`;
    const song = resolveSong(parse(src));
    const sr = 22050;
    const samples = renderSongToPCM(song, { sampleRate: sr, duration: 2.0, channels: 1, bpm: 120 });
    // Note is 8 ticks at 120 BPM → 0.5s; look for echo tail after that
    const start = Math.floor(0.55 * sr);
    const end = Math.floor(1.2 * sr);
    let energy = 0;
    for (let i = start; i < end && i < samples.length; i++) energy += samples[i] * samples[i];
    expect(energy).toBeGreaterThan(1e-6);
  });

  test('retrig renders non-silent audio', () => {
    const src = `
chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=gb:15,down,0
pat p = C4<retrig:2,-2>:8
channel 1 => inst lead pat p
play
`;
    const song = resolveSong(parse(src));
    const samples = renderSongToPCM(song, { sampleRate: 22050, duration: 1.0, channels: 1, bpm: 120 });
    let energy = 0;
    for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
    expect(energy).toBeGreaterThan(0);
  });
});
