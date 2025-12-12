import { resolveSong } from '../src/song/resolver';
import { parse } from '../src/parser';

describe('resolver hits (smoke)', () => {
  test('resolver returns SongModel with channels', () => {
    const src = `
      pat A = C4
      seq s = A A A
      channel 1 => seq s
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    expect(Array.isArray(song.channels)).toBeTruthy();
  });
});
