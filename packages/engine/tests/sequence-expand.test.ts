import * as seqs from '../src/sequences/expand';
import { parse } from '../src/parser';

describe('sequence expand (smoke)', () => {
  test('expandAllSequences is available', () => {
    expect(typeof seqs.expandAllSequences === 'function').toBeTruthy();
  });
});
