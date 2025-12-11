import { parse } from '../src/parser';

describe('pattern definition modifiers', () => {
  test('modifier on pat def (rev) flips tokens', () => {
    const src = `pat X:rev = C4 D4 E4`;
    const ast = parse(src);
    expect(ast.pats.X).toEqual(['E4', 'D4', 'C4']);
  });
});
