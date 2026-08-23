/** @jest-environment node */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  collectBaxDefs,
  collectSemanticChangeLines,
  insertDefinitionLine,
  tryMergeChangedDefinitions,
} from '../src/renderer/src/lib/bax-def-index';
import { computeLineChangeDiff, countAIChangeDiff } from '../src/renderer/src/lib/line-change-diff';

const sampleSongPath = resolve(__dirname, '../../../songs/sample.bax');
const sampleSong = readFileSync(sampleSongPath, 'utf8');

describe('tryMergeChangedDefinitions', () => {
  it('merges only changed pat lines into an existing song', () => {
    const previous = [
      '# header comment',
      'chip gameboy',
      'bpm 128',
      'pat drum_intro = kick . . . kick . . . kick . . . kick . . .',
      'pat drum_intro_tick = kick . kick . kick . kick . kick . kick . kick . kick .',
      'pat drum_intro_push = kick kick . kick kick . kick kick . kick kick .',
      'seq drum_seq_intro = drum_intro drum_intro drum_intro drum_intro',
      'play auto',
    ].join('\n');

    const candidate = [
      'chip gameboy',
      'bpm 128',
      'pat drum_intro = kick hat . kick . hat . kick hat . kick . hat .',
      'pat drum_intro_tick = kick hat kick . kick hat kick . kick hat kick . kick hat kick .',
      'pat drum_intro_push = kick snare hat kick kick snare . kick snare hat kick kick snare .',
      'seq drum_seq_intro = drum_intro drum_intro drum_intro drum_intro',
      'play auto',
    ].join('\n');

    const merged = tryMergeChangedDefinitions(previous, candidate);
    expect(merged).not.toBeNull();
    expect(merged).toContain('# header comment');
    expect(merged).toContain('pat drum_intro = kick hat . kick . hat . kick hat . kick . hat .');
    expect(merged).toContain('pat drum_intro_tick = kick hat kick . kick hat kick . kick hat kick . kick hat kick .');
    expect(merged).toContain('pat drum_intro_push = kick snare hat kick kick snare . kick snare hat kick kick snare .');

    const diff = computeLineChangeDiff(previous, merged!);
    expect(countAIChangeDiff(diff).total).toBe(3);
    expect(collectSemanticChangeLines(previous, merged!)).toHaveLength(3);
  });

  it('prefers semantic merge over full-file replace when the model reformats everything', () => {
    const tweaked = sampleSong.replace(
      'pat drums_pat      = (snare . . .) (snare . . .) (snare . . .) (snare . hihat .)',
      'pat drums_pat      = (snare hihat . .) (snare hihat . .) (snare hihat . .) (snare hihat hihat .)',
    );
    const reformatted = tweaked
      .split('\n')
      .map((line) => line.replace(/\s{2,}/g, ' '))
      .join('\n');

    const fullDiffCount = countAIChangeDiff(computeLineChangeDiff(sampleSong, reformatted)).total;
    expect(fullDiffCount).toBeGreaterThan(10);

    const merged = tryMergeChangedDefinitions(sampleSong, reformatted);
    expect(merged).not.toBeNull();
    const mergedDiffCount = countAIChangeDiff(computeLineChangeDiff(sampleSong, merged!)).total;
    expect(mergedDiffCount).toBeLessThan(fullDiffCount);
    expect(merged).toContain('(snare hihat . .)');
    expect(merged).toContain('play auto repeat');
  });

  it('collectBaxDefs tracks 1-based line numbers', () => {
    const defs = collectBaxDefs('chip gameboy\npat p = C5\nplay');
    expect(defs.get('pattern:p')?.lineNumber).toBe(2);
  });
});

describe('insertDefinitionLine', () => {
  const patternDef = {
    kind: 'pattern' as const,
    name: 'drums',
    body: 'kick . . .',
    line: 'pat drums = kick . . .',
    lineNumber: 2,
  };

  it('inserts before play when re-adding the last definition of a kind', () => {
    const content = 'chip gameboy\nplay auto\n';
    expect(insertDefinitionLine(content, patternDef)).toBe(
      'chip gameboy\npat drums = kick . . .\nplay auto\n',
    );
  });

  it('inserts after the last same-kind definition but still before play', () => {
    const content = 'pat a = C4\npat b = D4\nplay auto\n';
    const def = { ...patternDef, name: 'c', body: 'E4', line: 'pat c = E4' };
    expect(insertDefinitionLine(content, def)).toBe(
      'pat a = C4\npat b = D4\npat c = E4\nplay auto\n',
    );
  });

  it('appends at end when no play directive is present', () => {
    const content = 'chip gameboy\nbpm 120';
    expect(insertDefinitionLine(content, patternDef)).toBe(
      'chip gameboy\nbpm 120\npat drums = kick . . .',
    );
  });
});
