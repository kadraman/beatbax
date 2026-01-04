import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';

describe('Arrange edge cases - trailing commas and blank lines', () => {
  test('allows trailing comma and blank-line separated rows', () => {
    const src = `
      pat a = C4
      pat b = D4
      seq aseq = a
      seq bseq = b

      arrange main {
        aseq | bseq | . | . ,

        aseq | bseq | . | .,
      }
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    const ch1 = song.channels.find(c => c.id === 1)!;
    // should have two events (one per row)
    const tokens = ch1.events.map((e: any) => e.token);
    expect(tokens).toEqual(['C4', 'C4']);
  });
});
