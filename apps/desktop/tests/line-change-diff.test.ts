/** @jest-environment node */

import {
  computeLineChangeDiff,
  countAIChangeDiff,
  LCS_DP_MAX_CELLS,
  matchLineEndings,
  onlyCommentLinesChanged,
} from '../src/renderer/src/lib/line-change-diff';

describe('onlyCommentLinesChanged', () => {
  const previous = '## Demo song\nchip gameboy\npat a = C4\nplay\n';

  it('is true when only comment lines changed', () => {
    const next = previous.replace('## Demo song', '## Demo song with a drum fill');
    expect(onlyCommentLinesChanged(next, computeLineChangeDiff(previous, next))).toBe(true);
  });

  it('is false when a song line changed', () => {
    const next = previous.replace('pat a = C4', 'pat a = C4 E4');
    expect(onlyCommentLinesChanged(next, computeLineChangeDiff(previous, next))).toBe(false);
  });

  it('is false when nothing changed', () => {
    expect(onlyCommentLinesChanged(previous, computeLineChangeDiff(previous, previous))).toBe(false);
  });
});

describe('matchLineEndings', () => {
  it('converts an LF reply to CRLF when the editor uses CRLF', () => {
    expect(matchLineEndings('a\nb\n', 'x\r\ny\r\n')).toBe('a\r\nb\r\n');
  });

  it('converts CRLF and mixed endings to LF when the editor uses LF', () => {
    expect(matchLineEndings('a\r\nb\nc\r', 'x\ny')).toBe('a\nb\nc\n');
  });

  it('keeps a CRLF diff limited to the lines that really changed', () => {
    const editor = 'chip gameboy\r\nbpm 120\r\npat p = C5\r\nplay\r\n';
    const reply = 'chip gameboy\nbpm 120\npat p = C5 E5\nplay\n';
    expect(countAIChangeDiff(computeLineChangeDiff(editor, reply)).total).toBe(4);
    expect(countAIChangeDiff(computeLineChangeDiff(editor, matchLineEndings(reply, editor))).total).toBe(1);
  });
});

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
