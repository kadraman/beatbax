/** @jest-environment node */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  collectCopilotEditChanges,
  discardRemainingCopilotEditChanges,
  resolveCopilotChangeLineNumber,
  revertCopilotEditChange,
  unchangedDefinitionsMentioned,
} from '../src/renderer/src/lib/copilot-edit-changes';
import { collectSemanticChangeLines } from '../src/renderer/src/lib/bax-def-index';
import { computeLineChangeDiff, countAIChangeDiff } from '../src/renderer/src/lib/line-change-diff';

const dancefloorPulsePath = resolve(__dirname, '../../../songs/gameboy/dancefloor_pulse.bax');
const dancefloorPulse = readFileSync(dancefloorPulsePath, 'utf8');

function findPatternLine(source: string, name: string): number {
  const pattern = new RegExp(`^\\s*pat\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  const index = source.split('\n').findIndex((line) => pattern.test(line));
  if (index < 0) throw new Error(`Pattern not found: ${name}`);
  return index + 1;
}

function findPatternLineRange(source: string, names: string[]): { fromStart: number; fromEnd: number } {
  const lines = names.map((name) => findPatternLine(source, name));
  return { fromStart: Math.min(...lines), fromEnd: Math.max(...lines) };
}

function moveLines(source: string, fromStart: number, fromEnd: number, insertBefore: number): string {
  const lines = source.split('\n');
  const block = lines.splice(fromStart - 1, fromEnd - fromStart + 1);
  const insertIndex = insertBefore - 1 - (fromStart < insertBefore ? block.length : 0);
  lines.splice(insertIndex, 0, ...block);
  return lines.join('\n');
}

describe('collectCopilotEditChanges', () => {
  it('lists added, updated, and removed definitions', () => {
    const previous = [
      'pat drum_intro = kick . . .',
      'pat drum_build = kick . hat .',
      'seq drum_seq = drum_intro drum_intro',
    ].join('\n');
    const next = [
      'pat drum_intro = kick hat . kick .',
      'pat drum_intro_var = kick . hat . kick .',
      'seq drum_seq = drum_intro drum_intro_var',
    ].join('\n');

    const changes = collectCopilotEditChanges(previous, next);
    expect(changes.map((change) => change.action)).toEqual(['updated', 'added', 'removed', 'updated']);
  });

  it('detects relocated patterns without body changes (dancefloor_pulse bass move)', () => {
    const movedPatternNames = ['bass_intro_pulse', 'bass_intro_tick', 'bass_intro_rise'];
    const { fromStart, fromEnd } = findPatternLineRange(dancefloorPulse, movedPatternNames);
    const insertBefore = findPatternLine(dancefloorPulse, 'drum_full');
    const moved = moveLines(dancefloorPulse, fromStart, fromEnd, insertBefore);
    const changes = collectCopilotEditChanges(dancefloorPulse, moved);
    const movedPatterns = changes.filter((change) => change.action === 'moved');
    expect(movedPatterns.map((change) => change.name)).toEqual(movedPatternNames);
    expect(collectSemanticChangeLines(dancefloorPulse, moved)).toHaveLength(3);

    const lineDiffTotal = countAIChangeDiff(computeLineChangeDiff(dancefloorPulse, moved)).total;
    expect(lineDiffTotal).toBeGreaterThan(movedPatterns.length);
  });
});

describe('revertCopilotEditChange', () => {
  it('reverts an added pattern line', () => {
    const baseline = 'pat drum_intro = kick . . .\nplay\n';
    const edited = 'pat drum_intro = kick . . .\npat drum_intro_var = kick hat .\nplay\n';
    const added = collectCopilotEditChanges(baseline, edited)[0];
    const reverted = revertCopilotEditChange(edited, added, baseline);
    expect(reverted).toBe(baseline);
  });

  it('reverts an updated pattern line', () => {
    const baseline = 'pat drum_intro = kick . . .\nplay\n';
    const edited = 'pat drum_intro = kick hat . kick .\nplay\n';
    const updated = collectCopilotEditChanges(baseline, edited)[0];
    const reverted = revertCopilotEditChange(edited, updated, baseline);
    expect(reverted).toBe(baseline);
  });

  it('reverts a removed pattern before play', () => {
    const baseline = 'pat drum_intro = kick . . .\nplay auto\n';
    const edited = 'play auto\n';
    const removed = collectCopilotEditChanges(baseline, edited)[0];
    const reverted = revertCopilotEditChange(edited, removed, baseline);
    expect(reverted).toBe(baseline);
  });

  it('reverts a single relocated pattern', () => {
    const previous = [
      '# Drum patterns',
      'pat drum_full = kick . hat .',
      'pat bass_wrong = C2',
      'play',
    ].join('\n');
    const next = [
      '# Bass patterns',
      'pat bass_wrong = C2',
      '# Drum patterns',
      'pat drum_full = kick . hat .',
      'play',
    ].join('\n');
    const moved = collectCopilotEditChanges(previous, next).find((change) => change.name === 'bass_wrong');
    expect(moved?.action).toBe('moved');
    if (!moved) return;

    const reverted = revertCopilotEditChange(next, moved, previous);
    expect(collectCopilotEditChanges(previous, reverted)).toHaveLength(0);
  });
});

describe('discardRemainingCopilotEditChanges', () => {
  const baseline = [
    '# Sample song',
    'pat melody_pat = C4 E4 G4 C5',
    'pat bass_pat = C2 . G2 .',
    'seq main = melody_pat bass_pat',
    'play',
  ].join('\r\n');
  const edited = [
    '# Sample song',
    '##   vib  : added vibrato to the last note of each phrase in melody_pat',
    '',
    'pat melody_pat = C4 E4 G4 C5<vib:4,3>',
    'pat bass_pat = C2 . G2 G2',
    'seq main = melody_pat bass_pat',
    'play',
  ].join('\r\n');

  function review(statuses: Array<'pending' | 'kept' | 'discarded'>) {
    const changes = collectCopilotEditChanges(baseline, edited);
    expect(changes).toHaveLength(statuses.length);
    return changes.map((change, index) => ({ ...change, status: statuses[index] }));
  }

  it('restores the baseline verbatim when nothing was kept, including non-definition lines', () => {
    const result = discardRemainingCopilotEditChanges(edited, review(['pending', 'pending', 'pending']), baseline);
    expect(result.content).toBe(baseline);
    expect(result.changes.map((change) => change.status)).toEqual(['discarded', 'discarded', 'discarded']);
  });

  it('restores the baseline when earlier changes were already discarded', () => {
    const changes = review(['discarded', 'pending', 'pending']);
    const partlyReverted = revertCopilotEditChange(edited, changes[0], baseline);
    const result = discardRemainingCopilotEditChanges(partlyReverted, changes, baseline);
    expect(result.content).toBe(baseline);
  });

  it('keeps kept changes and reverts only pending definitions', () => {
    const result = discardRemainingCopilotEditChanges(edited, review(['kept', 'pending', 'pending']), baseline);
    expect(result.content).toContain('pat melody_pat = C4 E4 G4 C5<vib:4,3>');
    expect(result.content).toContain('pat bass_pat = C2 . G2 .');
    expect(result.changes.map((change) => change.status)).toEqual(['kept', 'discarded', 'discarded']);
  });
});

describe('unchangedDefinitionsMentioned', () => {
  const previous = [
    'pat drums_pat = snare . . .',
    'pat bass_pat = C3 G2',
    'seq drums_seq = drums_pat',
    'play',
  ].join('\n');
  const next = previous.replace('pat bass_pat = C3 G2', 'pat bass_pat = C3 G2 C3 G2');

  it('lists mentioned definitions when none of them changed', () => {
    expect(unchangedDefinitionsMentioned('Added a fill to drums_pat and drums_seq.', previous, next))
      .toEqual(['drums_pat', 'drums_seq']);
  });

  it('returns nothing when a mentioned definition changed', () => {
    expect(unchangedDefinitionsMentioned('Doubled bass_pat; drums_pat is unchanged.', previous, next)).toEqual([]);
  });

  it('does not count a definition that only moved as changed', () => {
    const commented = `# drums\n# more drums\n${previous}`;
    expect(unchangedDefinitionsMentioned('Added a fill to drums_pat.', commented, previous)).toEqual(['drums_pat']);
  });

  it('ignores instrument names used as ordinary words', () => {
    const withInst = `inst snare type=noise\n${previous}`;
    expect(unchangedDefinitionsMentioned('Added a snare hit.', withInst, withInst.replace('C3 G2', 'C3 G2 C3'))).toEqual([]);
  });

  it('returns nothing when no definition is mentioned', () => {
    expect(unchangedDefinitionsMentioned('Added a drum fill.', previous, next)).toEqual([]);
  });
});

describe('resolveCopilotChangeLineNumber', () => {
  it('returns the current line number for a definition id', () => {
    const content = 'chip gameboy\npat drum_intro = kick .\nplay\n';
    expect(resolveCopilotChangeLineNumber(content, 'pattern:drum_intro', 99)).toBe(2);
    expect(resolveCopilotChangeLineNumber(content, 'pattern:missing', 99)).toBe(99);
  });
});
