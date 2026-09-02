/**
 * Unit tests for command label registry + context-menu metadata.
 */

import { KeyCode, KeyMod } from 'monaco-editor';
import {
  ARRANGEMENT_FIX_LABELS,
  BEATBAX_CONTEXT_MENU_GROUP,
  COMMAND_REGISTRY,
  commandActionUi,
  contextMenuCommandKeys,
  formatCommandLabel,
  keyedCommandKeys,
  type CommandMeta,
} from '../src/editor/command-labels';

function contextMenuPrecondition(key: keyof typeof COMMAND_REGISTRY): string | undefined {
  const meta = COMMAND_REGISTRY[key] as CommandMeta;
  return meta.contextMenu?.precondition ?? meta.precondition;
}

describe('command-labels', () => {
  it('uses flat / Category: labels in standalone and BeatBax: in vscode', () => {
    expect(formatCommandLabel('exportWav')).toBe('Export: WAV');
    expect(formatCommandLabel('exportWav', { context: 'standalone' })).toBe('Export: WAV');
    expect(formatCommandLabel('exportWav', { context: 'vscode' })).toBe('BeatBax: Export: WAV');
    expect(formatCommandLabel('gotoDefinition')).toBe('Go to Definition');
    expect(formatCommandLabel('quickExport')).toBe('Quick Export');
  });

  it('exposes a curated context menu with at least five always-visible items', () => {
    const keys = contextMenuCommandKeys();
    const alwaysVisible = keys.filter((key) => !contextMenuPrecondition(key));

    expect(alwaysVisible).toEqual(expect.arrayContaining([
      'formatDocument',
      'quickExport',
      'listDefinitions',
      'insertTransform',
      'showSyntaxHelp',
    ]));
    expect(alwaysVisible.length).toBeGreaterThanOrEqual(5);
    expect(keys).not.toContain('verifySong');
    expect(keys).not.toContain('playSelection');
    expect(keys).not.toContain('previewPattern');
    expect(keys).not.toContain('gotoPatternDef');
    expect(keys.length).toBeGreaterThanOrEqual(10);

    const orders = keys
      .map((k) => (COMMAND_REGISTRY[k] as { contextMenu?: { order: number } }).contextMenu!.order)
      .sort((a, b) => a - b);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('keeps only the three approved Monaco keybindings', () => {
    expect(keyedCommandKeys().sort()).toEqual([
      'extractToPattern',
      'gotoPatternDef',
      'quickExport',
    ].sort());

    expect(commandActionUi('playSelection').keybindings).toEqual([]);
    expect(commandActionUi('gotoPatternDef').keybindings).toEqual([
      KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyD,
    ]);
    expect(commandActionUi('previewPattern').keybindings).toEqual([]);
    expect(commandActionUi('extractToPattern').keybindings).toEqual([
      KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE,
    ]);
    expect(commandActionUi('quickExport').keybindings).toEqual([
      KeyMod.CtrlCmd | KeyCode.KeyE,
    ]);
    expect(commandActionUi('exportMidi').keybindings).toEqual([]);
    expect(commandActionUi('verifySong').keybindings).toEqual([]);
    expect(commandActionUi('renameDefinition').keybindings).toEqual([]);
    expect(commandActionUi('showSyntaxHelp').keybindings).toEqual([]);
  });

  it('commandActionUi attaches context-menu fields and preconditions', () => {
    expect(commandActionUi('playSelection').precondition).toBe('false');
    expect(commandActionUi('playSelection').contextMenuGroupId).toBeUndefined();

    const goto = commandActionUi('gotoDefinition');
    expect(goto.label).toBe('Go to Definition');
    expect(goto.contextMenuGroupId).toBe(BEATBAX_CONTEXT_MENU_GROUP);
    expect(goto.contextMenuOrder).toBe(20);
    expect(goto.precondition).toBe('beatbax.canGotoDefinition');

    const findRefs = commandActionUi('findReferences');
    expect(findRefs.contextMenuGroupId).toBe(BEATBAX_CONTEXT_MENU_GROUP);
    expect(findRefs.precondition).toBe('beatbax.hasNamedSymbol');

    const exportWav = commandActionUi('exportWav');
    expect(exportWav.label).toBe('Export: WAV');
    expect(exportWav.contextMenuGroupId).toBeUndefined();

    const copilot = commandActionUi('addSelectionToCopilot');
    expect(copilot.precondition).toBe('beatbax.copilot && editorHasSelection');
    expect(copilot.label).toBe('Add Selection to Copilot');
  });

  it('arrangement fix labels stay aligned with palette commands', () => {
    expect(ARRANGEMENT_FIX_LABELS.split_monolithic).toBe(
      formatCommandLabel('splitMonolithicSections'),
    );
    expect(ARRANGEMENT_FIX_LABELS.restructure_phased).toBe(
      formatCommandLabel('restructurePhasedSections'),
    );
    expect(ARRANGEMENT_FIX_LABELS.add_section_markers).toBe(
      formatCommandLabel('addSectionMarkers'),
    );
    expect(ARRANGEMENT_FIX_LABELS.restructure_phased).toBe(
      'Arrange: Restructure Phased Sections into Headers',
    );
  });
});
