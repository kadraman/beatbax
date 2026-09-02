/**
 * Hide Monaco built-in actions that are noise in BeatBax Desktop / Web F1.
 *
 * Monaco's command palette lists every {@link monaco.editor.ICodeEditor.getSupportedActions}
 * entry. Patching that method is the supported way to filter without removing keybindings
 * for actions we keep (Find, fold, etc.).
 *
 * @module editor/hide-monaco-actions
 */

import type * as monaco from 'monaco-editor';

/**
 * Built-in action ids that should not appear in F1 for a BeatBax song editor.
 * Keybindings for these (if any) still work unless the host remaps them.
 */
export const HIDDEN_MONACO_ACTION_IDS: readonly string[] = [
  // Developer / theme chrome
  'editor.action.forceRetokenize',
  'editor.action.inspectTokens',
  'editor.action.toggleHighContrast',

  // Generic IDE leftovers (no BeatBax providers / redundant with BeatBax commands)
  'editor.action.quickOutline',
  'editor.action.rename',
  'editor.action.organizeImports',
  'editor.action.sourceAction',
  'editor.action.autoFix',
  'editor.action.fixAll',
  'editor.action.showDefinitionPreviewHover',
  'editor.action.linkedEditing',
  'editor.action.openLink',

  // Case / line transforms (unsafe around note tokens and identifiers)
  'editor.action.transformToUppercase',
  'editor.action.transformToLowercase',
  'editor.action.transformToTitlecase',
  'editor.action.transformToSnakecase',
  'editor.action.transformToCamelcase',
  'editor.action.transformToKebabcase',
  'editor.action.transposeLetters',
  'editor.action.transpose',
  'editor.action.sortLinesAscending',
  'editor.action.sortLinesDescending',
  'editor.action.joinLines',
  'editor.action.deleteDuplicateLines',

  // Niche editor chrome (app has its own font / folding prefs)
  'editor.action.fontZoomIn',
  'editor.action.fontZoomOut',
  'editor.action.fontZoomReset',
  'editor.action.toggleTabFocusMode',
  'editor.action.addCursorsToTop',
  'editor.action.addCursorsToBottom',
  'editor.action.focusNextCursor',
  'editor.action.focusPreviousCursor',
  'editor.action.unicodeHighlight.disableHighlightingOfAmbiguousCharacters',
  'editor.action.unicodeHighlight.disableHighlightingOfInvisibleCharacters',
  'editor.action.unicodeHighlight.disableHighlightingOfNonBasicAsciiCharacters',
  'editor.action.unicodeHighlight.showExcludeOptions',

  // Inline suggest plumbing (unused unless Copilot wires Monaco inline)
  'editor.action.inlineSuggest.trigger',
  'editor.action.inlineSuggest.show',
  'editor.action.inlineSuggest.hide',
  'editor.action.inlineSuggest.acceptNextWord',
  'editor.action.inlineSuggest.acceptNextLine',
];

const HIDDEN = new Set(HIDDEN_MONACO_ACTION_IDS);

/** Whether an action id is on the BeatBax F1 hide list. */
export function isHiddenMonacoActionId(id: string): boolean {
  return HIDDEN.has(id);
}

/**
 * Filter {@link monaco.editor.IEditorAction} arrays the same way F1 would see them.
 */
export function filterMonacoActionsForPalette<T extends { id: string }>(actions: readonly T[]): T[] {
  return actions.filter((action) => !HIDDEN.has(action.id));
}

/**
 * Patch `editor.getSupportedActions` so Monaco's F1 quick-command picker omits
 * irrelevant built-ins. Safe to call once per editor instance.
 */
export function hideIrrelevantMonacoActions(
  editor: monaco.editor.IStandaloneCodeEditor,
): void {
  const original = editor.getSupportedActions.bind(editor);
  editor.getSupportedActions = () => filterMonacoActionsForPalette(original());
}
