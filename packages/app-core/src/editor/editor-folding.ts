/**
 * Refresh Monaco comment folding after large buffer rewrites.
 * executeEdits/setValue keep collapsed regions at old line numbers until we
 * unfold and (optionally) re-apply the user's fold-comments preference.
 */

import type * as monaco from 'monaco-editor';
import { settingFoldComments } from '../stores/settings.store.js';

/** Clear stale folds, then re-apply fold-comments when that preference is on. */
export function refreshEditorFolding(
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
  folded = settingFoldComments.get(),
): void {
  if (!editor) return;
  editor.trigger('beatbax', 'editor.unfoldAll', null);
  if (!folded) return;
  const fold = () => editor.trigger('beatbax', 'editor.foldAllBlockComments', null);
  requestAnimationFrame(() => requestAnimationFrame(fold));
  window.setTimeout(fold, 100);
}

/** Replace the full model and refresh folding so gutters match the new layout. */
export function applyFullDocumentEdit(
  editor: monaco.editor.IStandaloneCodeEditor,
  source: string,
  text: string,
  options?: { forceMoveMarkers?: boolean },
): void {
  const model = editor.getModel();
  if (!model) return;
  editor.executeEdits(source, [{
    range: model.getFullModelRange(),
    text,
    forceMoveMarkers: options?.forceMoveMarkers ?? false,
  }]);
  refreshEditorFolding(editor);
}
