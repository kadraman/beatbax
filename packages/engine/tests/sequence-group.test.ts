import { parse } from '../src/parser';
import { expandAllSequences } from '../src/sequences/expand';

describe('sequence group repetition', () => {
  test('expands (A B)*2 correctly', () => {
    const src = `
      pat A = C4
      pat B = D4
      seq s = (A B)*2
    `;
    const ast = parse(src);
    const expanded = expandAllSequences(ast.seqs, ast.pats);
    expect(expanded.s).toEqual(['C4','D4','C4','D4']);
  });

  test('expands nested tokens and repeats pattern groups with modifiers', () => {
    const src = `
      pat A = C4
      pat B = D4
      seq s = (A:inst(foo) B)*2
    `;
    const ast = parse(src);
    const expanded = expandAllSequences(ast.seqs, ast.pats);
    // inst(foo) will be emitted before A; expansion should include that token
    expect(expanded.s.slice(0,3)).toEqual(['inst(foo)','C4','D4']);
  });
});
