import { expandSequenceItems, expandAllSequences } from '../src/sequences/expand';

describe('sequences.expand', () => {
  test('expands simple sequence items resolving patterns', () => {
    const pats = { A: ['C4', 'D4'], B: ['E3'] };
    const items = ['A', 'B', 'A:oct(-1)'];
    const expanded = expandSequenceItems(items, pats);
    expect(expanded).toEqual(['C4', 'D4', 'E3', 'C3', 'D3']);
  });

  test('applies rev and inst modifiers and slow', () => {
    const pats = { A: ['C4', 'E4'] };
    const items = ['A:inst(bass)', 'A:rev', 'A:slow(3)'];
    const expanded = expandSequenceItems(items, pats);
    // inst(bass) should be emitted before the first A tokens
    expect(expanded.slice(0, 1)).toEqual(['inst(bass)']);
    // first A: C4 E4
    expect(expanded.slice(1, 3)).toEqual(['C4', 'E4']);
    // A:rev -> E4 C4
    expect(expanded.slice(3, 5)).toEqual(['E4', 'C4']);
    // A:slow(3) -> each token repeated 3 times
    expect(expanded.slice(5)).toEqual(['C4', 'C4', 'C4', 'E4', 'E4', 'E4']);
  });

  test('expandAllSequences builds map for all seqs', () => {
    const pats = { A: ['C4'] };
    const seqs = { main: ['A', 'A:oct(-1)'], alt: ['A:inst(s)'] };
    const res = expandAllSequences(seqs, pats);
    expect(res.main).toEqual(['C4', 'C3']);
    expect(res.alt).toEqual(['inst(s)', 'C4']);
  });
});
