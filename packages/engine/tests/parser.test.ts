import { parse } from '../src/parser';

describe('parser.parse', () => {
  test('resolves simple pat definitions', () => {
    const src = `
      pat A = C4 E4 G4
      pat B = (C3 . G2 .)*2
    `;
    const ast = parse(src);
    expect(ast.pats.A).toEqual(['C4', 'E4', 'G4']);
    expect(ast.pats.B).toEqual(['C3', '.', 'G2', '.', 'C3', '.', 'G2', '.']);
  });

  test('handles quoted pattern strings', () => {
    const src = `pat S = "x . x x"`;
    const ast = parse(src);
    expect(ast.pats.S).toEqual(['x', '.', 'x', 'x']);
  });
});
