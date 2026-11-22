import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';
import { renderSongToPCM } from '../src/audio/pcmRenderer.js';

describe('pcmRenderer wave arp (112)', () => {
  test('wave channel with arp renders non-silent audio', () => {
    const src = `
chip gameboy
bpm 120
inst bass type=wave volume=100 wave=[0,2,4,6,8,10,12,14,15,14,12,10,8,6,4,2]
pat p = C3<arp:4,7>:8
channel 3 => inst bass pat p
play
`;
    const song = resolveSong(parse(src));
    const samples = renderSongToPCM(song, { sampleRate: 22050, duration: 1.0, channels: 1, bpm: 120 });
    let energy = 0;
    for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
    expect(energy).toBeGreaterThan(0);
  });
});
