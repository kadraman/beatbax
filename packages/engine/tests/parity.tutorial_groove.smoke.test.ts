import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';
import { renderSongToPCM } from '../src/audio/pcmRenderer.js';

/**
 * Smoke parity gate for tutorial_groove (spec 112 US1).
 * Full Offline WebAudio vs PCM correlation is a follow-up harness (T001/T015);
 * this ensures vib/arp/port-bearing channels produce audible PCM energy.
 */
describe('tutorial_groove PCM smoke (112)', () => {
  const src = readFileSync(
    join(__dirname, '../../../songs/gameboy/tutorial_groove.bax'),
    'utf8'
  );

  test('full mix and effect channels render non-silent PCM', () => {
    const song = resolveSong(parse(src));
    const opts = { sampleRate: 22050, channels: 2 as const, bpm: 140, duration: 4 };

    const full = renderSongToPCM(song, opts);
    let fullE = 0;
    for (let i = 0; i < full.length; i++) fullE += full[i] * full[i];
    expect(fullE).toBeGreaterThan(0);

    for (const ch of [1, 2, 3, 4]) {
      const stem = renderSongToPCM(song, { ...opts, renderChannels: [ch] });
      let e = 0;
      for (let i = 0; i < stem.length; i++) e += stem[i] * stem[i];
      expect(e).toBeGreaterThan(0);
    }
  });
});
