/**
 * Replace editor text as a single Monaco undo step.
 * `ICodeEditor.setValue()` rebuilds the model and clears the undo stack.
 */

import type * as monaco from 'monaco-editor';

export function applyUndoableReplace(
  editor: monaco.editor.IStandaloneCodeEditor,
  source: string,
  text: string,
): boolean {
  const model = editor.getModel();
  if (!model) return false;
  if (model.getValue() === text) return false;
  editor.executeEdits(source, [{
    range: model.getFullModelRange(),
    text,
    forceMoveMarkers: true,
  }]);
  return true;
}
