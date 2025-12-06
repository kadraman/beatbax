import { parse } from '../src/parser';

describe('pattern transforms', () => {
  test('rev modifier reverses pattern at pat declaration', () => {
    const src = `
      pat R:rev = C4 D4 E4
    `;
    const ast = parse(src);
    expect(ast.pats.R).toEqual(['E4', 'D4', 'C4']);
  });

  test('slow repeats each token by factor (default 2)', () => {
    const src = `
      pat S:slow = C4 C5
    `;
    const ast = parse(src);
    expect(ast.pats.S).toEqual(['C4', 'C4', 'C5', 'C5']);
  });

  test('fast(n) takes every nth token', () => {
    const src = `
      pat F:fast(3) = C1 C2 C3 C4 C5 C6
    `;
    const ast = parse(src);
    // indices 0 and 3 should be kept (0-based)
    expect(ast.pats.F).toEqual(['C1', 'C4']);
  });

  test('combined channel modifiers apply in order (rev then slow)', () => {
    const src = `
      pat A = C4 D4 E4
      channel 1 => inst lead pat A:rev:slow(2)
    `;
    const ast = parse(src);
    const ch = ast.channels.find(c => c.id === 1)!;
    expect(ch.pat).toEqual(['E4', 'E4', 'D4', 'D4', 'C4', 'C4']);
  });
});
