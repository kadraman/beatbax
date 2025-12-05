import { parse } from '../src/parser';

describe('pat definition modifiers', () => {
  test('pat definition with oct modifier stores transposed pattern', () => {
    const src = `
      pat A:oct(-1) = C4 E4 G4
    `;
    const ast = parse(src);
    expect(ast.pats.A).toEqual(['C3', 'E3', 'G3']);
  });

  test('pat definition with semitone modifier stores transposed pattern', () => {
    const src = `
      pat Lead:+2 = C4 E4
    `;
    const ast = parse(src);
    expect(ast.pats.Lead).toEqual(['D4', 'F#4']);
  });
});
