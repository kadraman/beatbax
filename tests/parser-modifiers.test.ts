import { parse } from '../src/parser';

describe('parser pattern modifiers', () => {
  test('channel pat with oct modifier applies transpose', () => {
    const src = `
      pat A = C4 E4 G4
      channel 3 => inst wave1 pat A:oct(-1)
    `;
    const ast = parse(src);
    expect(ast.pats.A).toEqual(['C4', 'E4', 'G4']);
    const ch = ast.channels.find(c => c.id === 3);
    expect(ch).toBeDefined();
    expect(ch!.pat).toEqual(['C3', 'E3', 'G3']);
  });

  test('channel pat with semitone modifier applies transpose', () => {
    const src = `
      pat B = C4 E4
      channel 2 => inst bass pat B:+2
    `;
    const ast = parse(src);
    const ch = ast.channels.find(c => c.id === 2)!;
    expect(ch.pat).toEqual(['D4', 'F#4']);
  });
});
