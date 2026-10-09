/** @jest-environment node */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  collectBaxDefs,
  collectSemanticChangeLines,
  collectUnmergedLines,
  describeDuplicateDefinition,
  findNewDuplicateDefinitions,
  insertDefinitionLine,
  tryMergeChangedDefinitions,
} from '../src/renderer/src/lib/bax-def-index';
import { collectCopilotEditChanges, revertCopilotEditChange } from '../src/renderer/src/lib/copilot-edit-changes';
import { computeLineChangeDiff, countAIChangeDiff, matchLineEndings } from '../src/renderer/src/lib/line-change-diff';

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

  it('merges a reply that left definitions out, keeping the existing ones', () => {
    const previous = 'chip gameboy\npat a = C4\npat b = D4\nseq s = a b\nchannel 1 => inst lead seq s\nplay\n';
    const partial = 'chip gameboy\npat a = C4\npat c = E4<vib:3,5>\nseq s = a b c\nchannel 1 => inst lead seq s\nplay\n';
    const merged = tryMergeChangedDefinitions(previous, partial);
    expect(merged).toContain('pat b = D4');
    expect(merged).toContain('pat c = E4<vib:3,5>');
    expect(merged).toContain('seq s = a b c');
  });

  it('round-trips merge and full revert on a CRLF song with an LF reply', () => {
    const baseline = sampleSong.replace(/\r?\n/g, '\r\n');
    const reply = baseline.replace(/\r\n/g, '\n')
      .replace(
        'pat drums_alt_pat     = (snare . . .)*2 perc . . . . . . .',
        'pat drums_alt_pat = (snare . . .) (snare . hihat .)\npat melody_var = C5<vib:3,5>:4 E5:4',
      )
      .replace('seq lead_seq = melody_pat melody_alt_pat fill_pat melody_pat', 'seq lead_seq = melody_pat melody_var fill_pat melody_pat');
    const replyMatched = matchLineEndings(reply, baseline);
    expect(countAIChangeDiff(computeLineChangeDiff(baseline, replyMatched)).total).toBe(3);

    const applied = matchLineEndings(tryMergeChangedDefinitions(baseline, replyMatched)!, baseline);
    const changes = collectCopilotEditChanges(baseline, applied);
    expect(changes.map((change) => `${change.action}:${change.id}`)).toEqual([
      'updated:pattern:drums_alt_pat',
      'added:pattern:melody_var',
      'updated:sequence:lead_seq',
    ]);
    const reverted = changes.reduce((content, change) => revertCopilotEditChange(content, change, baseline), applied);
    expect(matchLineEndings(reverted, baseline)).toBe(baseline);
  });

  it('collectBaxDefs tracks 1-based line numbers', () => {
    const defs = collectBaxDefs('chip gameboy\npat p = C5\nplay');
    expect(defs.get('pattern:p')?.lineNumber).toBe(2);
  });
});

describe('collectUnmergedLines', () => {
  it('lists changed non-definition lines and ignores definitions, comments, and whitespace', () => {
    const previous = '# lead\nchip gameboy\nbpm 120\npat a = C4\nplay auto\n';
    const candidate = '# new comment\nchip  gameboy\nbpm 140\npat a = C4 E4\npat b = D4\nplay auto repeat\n';
    expect(collectUnmergedLines(previous, candidate)).toEqual(['bpm 140', 'play auto repeat']);
  });

  it('ignores CRLF versus LF differences', () => {
    expect(collectUnmergedLines('chip gameboy\r\nplay\r\n', 'chip gameboy\nplay\n')).toEqual([]);
  });

  it('ignores // comment lines', () => {
    const previous = '// lead\nchip gameboy\nplay\n';
    const candidate = '// new lead\n  // indented note\nchip gameboy\nplay\n';
    expect(collectUnmergedLines(previous, candidate)).toEqual([]);
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

describe('findNewDuplicateDefinitions (spec 092)', () => {
  const previous = 'chip gameboy\npat melody_vib = C4 D4\nseq main = melody_vib\nplay auto\n';

  it('reports a duplicate the reply adds, with every line number', () => {
    const next = 'chip gameboy\npat melody_vib = C4 D4\nseq main = melody_vib\npat melody_vib = C4 D4<vib:3,5>\nplay auto\n';
    expect(findNewDuplicateDefinitions(previous, next)).toEqual([
      { kind: 'pattern', keyword: 'pat', name: 'melody_vib', lines: [2, 4] },
    ]);
  });

  it('ignores duplicates already present in the editor song', () => {
    const withDup = 'pat mel_a1 = C4\npat mel_a1 = D4\npat other = E4\n';
    const reply = 'pat mel_a1 = C4\npat mel_a1 = D4\npat other = G4\n';
    expect(findNewDuplicateDefinitions(withDup, reply)).toEqual([]);
  });

  it('allows a reply that removes a pre-existing duplicate', () => {
    const withDup = 'pat mel_a1 = C4\npat mel_a1 = D4\n';
    expect(findNewDuplicateDefinitions(withDup, 'pat mel_a1 = D4\n')).toEqual([]);
  });

  it('reports a pre-existing duplicate that the reply defines yet again', () => {
    const withDup = 'pat x = C4\npat x = D4\n';
    expect(findNewDuplicateDefinitions(withDup, 'pat x = C4\npat x = D4\npat x = E4\n')).toEqual([
      { kind: 'pattern', keyword: 'pat', name: 'x', lines: [1, 2, 3] },
    ]);
  });

  it('treats each kind as its own namespace and ignores channels', () => {
    const next = 'pat x = C4\nseq x = x\ninst x type=pulse1\neffect x = vib:4,6\nchannel 1 => seq x\nchannel 1 => seq x\n';
    expect(findNewDuplicateDefinitions('', next)).toEqual([]);
  });

  it('covers seq, inst and effect, sorted by first line', () => {
    const next = [
      'inst lead type=pulse1 duty=50',
      'effect wob = vib:4,6',
      'seq s = a',
      'inst lead type=pulse1 duty=25',
      'effect wob = vib:2,3',
      'seq s = b',
    ].join('\r\n');
    expect(findNewDuplicateDefinitions('', next).map((d) => [d.keyword, d.name, d.lines])).toEqual([
      ['inst', 'lead', [1, 4]],
      ['effect', 'wob', [2, 5]],
      ['seq', 's', [3, 6]],
    ]);
  });

  it('describes duplicates for the repair prompt and blocked summary', () => {
    expect(describeDuplicateDefinition({ kind: 'pattern', keyword: 'pat', name: 'melody_vib', lines: [93, 104] }))
      .toBe('`pat melody_vib` is defined more than once (lines 93 and 104)');
    expect(describeDuplicateDefinition({ kind: 'pattern', keyword: 'pat', name: 'x', lines: [1, 2, 3] }))
      .toBe('`pat x` is defined more than once (lines 1, 2 and 3)');
  });
});
