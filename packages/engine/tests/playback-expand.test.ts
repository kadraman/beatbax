import * as seqs from '../src/sequences/expand';

describe('playback expand', () => {
  test('expandAllSequences is available', () => {
    expect(typeof seqs.expandAllSequences === 'function').toBeTruthy();
  });
});
