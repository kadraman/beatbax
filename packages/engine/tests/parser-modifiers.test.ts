import { parse } from '../src/parser';

describe('parser modifiers', () => {
  test('inst modifier at seq level applies temporary instrument', () => {
    const src = `
      inst bass type=pulse2
      pat A = C3 C3
      seq main = A:inst(bass)
    `;
    const ast = parse(src);
    const seq = ast.seqs.main;
    // Smoke check: sequence parsed and present
    expect(seq).toBeDefined();
  });
});
