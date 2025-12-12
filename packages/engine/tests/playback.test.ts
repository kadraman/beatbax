import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';

describe('playback expansion', () => {
  test('playback expansion produces per-channel events', () => {
    const src = `
      pat A = C4
      seq s = A
      channel 1 => seq s
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    expect(song.channels[0].events).toBeDefined();
  });
});
