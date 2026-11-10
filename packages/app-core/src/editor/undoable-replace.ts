/**
 * Replace editor text as a single Monaco undo step.
 * `ICodeEditor.setValue()` rebuilds the model and clears the undo stack.
 *
 * Edits use the minimal changed character span so Instrument Editor keystrokes
 * and waveform/macro drags do not rewrite the entire document on every update.
 */

import type * as monaco from 'monaco-editor';

/** Inclusive start / exclusive end offsets into `previous`; `text` replaces that span. */
export function minimalTextEdit(
  previous: string,
  next: string,
): { start: number; end: number; text: string } | null {
  if (previous === next) return null;

  let start = 0;
  const prevLen = previous.length;
  const nextLen = next.length;
  const shared = Math.min(prevLen, nextLen);
  while (start < shared && previous.charCodeAt(start) === next.charCodeAt(start)) {
    start++;
  }

  let prevEnd = prevLen;
  let nextEnd = nextLen;
  while (
    prevEnd > start
    && nextEnd > start
    && previous.charCodeAt(prevEnd - 1) === next.charCodeAt(nextEnd - 1)
  ) {
    prevEnd--;
    nextEnd--;
  }

  return {
    start,
    end: prevEnd,
    text: next.slice(start, nextEnd),
  };
}

export function applyUndoableReplace(
  editor: monaco.editor.IStandaloneCodeEditor,
  source: string,
  text: string,
): boolean {
  const model = editor.getModel();
  if (!model) return false;

  const previous = model.getValue();
  const edit = minimalTextEdit(previous, text);
  if (!edit) return false;

  const start = model.getPositionAt(edit.start);
  const end = model.getPositionAt(edit.end);
  editor.executeEdits(source, [{
    range: {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    },
    text: edit.text,
    forceMoveMarkers: true,
  }]);
  return true;
}
