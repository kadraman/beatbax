/** @jest-environment node */

import {
  computeLineChangeDiff,
  LCS_DP_MAX_CELLS,
} from '../src/renderer/src/lib/line-change-diff';

describe('computeLineChangeDiff', () => {
  it('returns no changes for identical content', () => {
    const song = 'chip gameboy\nbpm 120\npat p = C5\n';
    const diff = computeLineChangeDiff(song, song);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.modified).toEqual([]);
  });

  it('detects a single added line with LCS diff', () => {
    const prev = 'a\nb\nc\n';
    const next = 'a\nx\nb\nc\n';
    const diff = computeLineChangeDiff(prev, next);
    expect(diff.added).toContain(2);
  });

  it('uses greedy scan without allocating LCS table for very large inputs', () => {
    const lineCount = Math.ceil(Math.sqrt(LCS_DP_MAX_CELLS)) + 50;
    const prev = `${'old\n'.repeat(lineCount)}tail`;
    const next = `${'new\n'.repeat(lineCount)}tail`;
    const diff = computeLineChangeDiff(prev, next);
    expect(diff.added.length + diff.removed.length + diff.modified.length).toBeGreaterThan(0);
  });
});
