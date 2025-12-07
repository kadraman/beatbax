import { parse } from '../src/parser';

describe('sequence parsing', () => {
  test('parses simple seq into token array', () => {
    const src = `
      pat A = C4
      pat B = D4
      seq main = A B A
    `;
    const ast = parse(src);
    expect(ast.seqs.main).toEqual(['A', 'B', 'A']);
  });

  test('preserves modifiers on seq items', () => {
    const src = `seq intro = A:inst(bass) B:oct(-1)`;
    const ast = parse(src);
    expect(ast.seqs.intro).toEqual(['A:inst(bass)', 'B:oct(-1)']);
  });
});
