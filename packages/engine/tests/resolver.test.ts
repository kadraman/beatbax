import { resolveSong } from '../src/song/resolver';
import { parse } from '../src/parser';

describe('resolver', () => {
  test('resolves sequence references into expanded events', () => {
    const src = `
      pat A = C4 D4
      seq s = A A
      channel 1 => seq s
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    expect(song.channels[0].events.length).toBeGreaterThan(0);
  });
});
