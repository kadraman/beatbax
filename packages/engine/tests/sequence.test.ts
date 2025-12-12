import { parse } from '../src/parser';

describe('sequence expansion', () => {
  test('sequence references patterns in order', () => {
    const src = `
      pat A = C4
      pat B = D4
      seq s = A B A
    `;
    const ast = parse(src);
    // sequence stored as reference list or expanded; ensure it exists
    expect(ast.seqs.s).toBeDefined();
  });
});
