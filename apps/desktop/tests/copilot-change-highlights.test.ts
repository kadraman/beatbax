/** @jest-environment node */

import {
  buildChangeDecorationSpecs,
  collectChangeHighlightLines,
  MAX_INLINE_CHANGE_HIGHLIGHTS,
} from '../src/renderer/src/lib/copilot-change-highlights';
import { computeLineChangeDiff, countAIChangeDiff } from '../src/renderer/src/lib/line-change-diff';

const fakeModel = {
  getLineCount: () => 10,
  getLineMaxColumn: (line: number) => (line === 1 ? 20 : 40),
};

describe('collectChangeHighlightLines', () => {
  it('lists every added and modified line for navigation', () => {
    const prev = [
      'chip gameboy',
      'pat drum_intro = kick . . .',
      'seq drum_seq_intro = drum_intro drum_intro drum_intro drum_intro',
      'play',
    ].join('\n');
    const next = [
      'chip gameboy',
      'pat drum_intro = kick . . .',
      'pat drum_intro_tick = kick . kick . kick . kick .',
      'pat drum_intro_push = kick kick . kick kick . kick kick . kick kick .',
      'seq drum_seq_intro = drum_intro drum_intro_tick drum_intro_push drum_intro',
      'play',
    ].join('\n');
    const diff = computeLineChangeDiff(prev, next);

    expect(collectChangeHighlightLines(diff)).toEqual([3, 4, 5]);
    expect(countAIChangeDiff(diff).total).toBe(3);
  });

  it('includes a single modified seq line only once', () => {
    const prev = 'seq drum_seq_intro = drum_intro drum_intro drum_intro drum_intro\n';
    const next = 'seq drum_seq_intro = drum_intro drum_intro_tick drum_intro drum_intro\n';
    const diff = computeLineChangeDiff(prev, next);

    expect(collectChangeHighlightLines(diff)).toEqual([1]);
    expect(countAIChangeDiff(diff).modified).toBe(1);
  });
});

describe('buildChangeDecorationSpecs', () => {
  it('never adds inline was: hints that corrupt the editor text', () => {
    const prev = 'pat drum_intro = kick . . .\nseq s = drum_intro drum_intro\n';
    const next = 'pat drum_intro = kick hat . kick .\nseq s = drum_intro drum_intro_tick\n';
    const diff = computeLineChangeDiff(prev, next);
    const specs = buildChangeDecorationSpecs(fakeModel as never, diff);

    for (const spec of specs) {
      expect(spec.options.after).toBeUndefined();
    }
  });

  it('caps highlighted lines when onlyLines is set', () => {
    const prev = Array.from({ length: 30 }, (_, i) => `line${i}`).join('\n');
    const next = Array.from({ length: 30 }, (_, i) => `changed${i}`).join('\n');
    const diff = computeLineChangeDiff(prev, next);
    const allLines = collectChangeHighlightLines(diff);
    expect(allLines.length).toBeGreaterThan(MAX_INLINE_CHANGE_HIGHLIGHTS);

    const capped = new Set(allLines.slice(0, MAX_INLINE_CHANGE_HIGHLIGHTS));
    const bigModel = {
      getLineCount: () => 30,
      getLineMaxColumn: () => 40,
    };
    const specs = buildChangeDecorationSpecs(bigModel as never, diff, { onlyLines: capped });
    expect(specs.length).toBe(MAX_INLINE_CHANGE_HIGHLIGHTS);
  });
});
