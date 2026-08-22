/** @jest-environment node */

import {
  collectCopilotEditChanges,
  resolveCopilotChangeLineNumber,
  revertCopilotEditChange,
} from '../src/renderer/src/lib/copilot-edit-changes';

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
});

describe('resolveCopilotChangeLineNumber', () => {
  it('returns the current line number for a definition id', () => {
    const content = 'chip gameboy\npat drum_intro = kick .\nplay\n';
    expect(resolveCopilotChangeLineNumber(content, 'pattern:drum_intro', 99)).toBe(2);
    expect(resolveCopilotChangeLineNumber(content, 'pattern:missing', 99)).toBe(99);
  });
});
