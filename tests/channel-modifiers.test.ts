import { parse } from '../src/parser';

describe('channel modifiers', () => {
  test('combines octave and semitone modifiers on channel pat', () => {
    const src = `
      pat X = C4 . A3
      channel 1 => inst lead pat X:oct(1):+2
    `;
    const ast = parse(src);
    // base pattern should remain unchanged
    expect(ast.pats.X).toEqual(['C4', '.', 'A3']);
    const ch = ast.channels.find(c => c.id === 1);
    expect(ch).toBeDefined();
    // C4 -> C5 (octave) -> +2 semitones => D5
    // A3 -> A4 -> +2 semitones => B4
    expect(ch!.pat).toEqual(['D5', '.', 'B4']);
  });
});
