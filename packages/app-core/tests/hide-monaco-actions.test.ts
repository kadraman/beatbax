/**
 * Unit tests for Monaco F1 action filtering.
 */

import {
  HIDDEN_MONACO_ACTION_IDS,
  filterMonacoActionsForPalette,
  hideIrrelevantMonacoActions,
  isHiddenMonacoActionId,
} from '../src/editor/hide-monaco-actions';

describe('hide-monaco-actions', () => {
  it('includes Developer: Force Retokenize and Inspect Tokens', () => {
    expect(HIDDEN_MONACO_ACTION_IDS).toContain('editor.action.forceRetokenize');
    expect(HIDDEN_MONACO_ACTION_IDS).toContain('editor.action.inspectTokens');
  });

  it('isHiddenMonacoActionId matches the blocklist', () => {
    expect(isHiddenMonacoActionId('editor.action.forceRetokenize')).toBe(true);
    expect(isHiddenMonacoActionId('actions.find')).toBe(false);
    expect(isHiddenMonacoActionId('editor.action.commentLine')).toBe(false);
  });

  it('filterMonacoActionsForPalette drops hidden ids and keeps useful ones', () => {
    const actions = [
      { id: 'editor.action.forceRetokenize', label: 'Developer: Force Retokenize' },
      { id: 'actions.find', label: 'Find' },
      { id: 'editor.action.transformToSnakecase', label: 'Transform to Snake Case' },
      { id: 'editor.action.commentLine', label: 'Toggle Line Comment' },
      { id: 'beatbax.quickExport', label: 'Quick Export' },
    ];
    expect(filterMonacoActionsForPalette(actions).map((a) => a.id)).toEqual([
      'actions.find',
      'editor.action.commentLine',
      'beatbax.quickExport',
    ]);
  });

  it('hideIrrelevantMonacoActions patches getSupportedActions on the editor', () => {
    const editor: any = {
      getSupportedActions: jest.fn(() => [
        { id: 'editor.action.forceRetokenize' },
        { id: 'actions.find' },
        { id: 'editor.action.inspectTokens' },
        { id: 'editor.action.fold' },
      ]),
    };

    hideIrrelevantMonacoActions(editor);

    expect(editor.getSupportedActions().map((a: { id: string }) => a.id)).toEqual([
      'actions.find',
      'editor.action.fold',
    ]);
  });
});
