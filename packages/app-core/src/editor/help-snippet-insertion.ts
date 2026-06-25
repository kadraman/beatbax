import * as monaco from 'monaco-editor';

function normalizeSnippetBlock(snippet: string): { text: string; lines: string[] } {
  const normalized = snippet.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
  const text = `${normalized}\n`;
  return { text, lines: normalized.split('\n') };
}

function isCollapsedSelection(selection: monaco.Selection): boolean {
  return selection.startLineNumber === selection.endLineNumber
    && selection.startColumn === selection.endColumn;
}

function setCursorAtInsertedBlockEnd(
  editor: monaco.editor.IStandaloneCodeEditor,
  startLine: number,
  insertedLines: string[],
): void {
  const lastLineOffset = Math.max(0, insertedLines.length - 1);
  const lastLine = insertedLines[insertedLines.length - 1] ?? '';
  editor.setPosition({
    lineNumber: startLine + lastLineOffset,
    column: lastLine.length + 1,
  });
}

/**
 * Insert a Help panel snippet as a standalone top-level block.
 *
 * Collapsed cursor: insert below the active line and leave that line unchanged.
 * Non-empty selection: replace whole selected lines with the snippet block so
 * partial selections cannot splice top-level BeatBax statements into a line.
 */
export function insertHelpSnippetBlock(
  editor: monaco.editor.IStandaloneCodeEditor,
  snippet: string,
  source = 'help-panel',
): void {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) return;

  const block = normalizeSnippetBlock(snippet);

  if (isCollapsedSelection(selection)) {
    const lineNumber = selection.startLineNumber;
    const insertColumn = model.getLineMaxColumn(lineNumber);
    editor.executeEdits(source, [{
      range: {
        startLineNumber: lineNumber,
        startColumn: insertColumn,
        endLineNumber: lineNumber,
        endColumn: insertColumn,
      },
      text: `\n${block.text}`,
      forceMoveMarkers: true,
    }]);
    setCursorAtInsertedBlockEnd(editor, lineNumber + 1, block.lines);
    editor.focus();
    return;
  }

  const startLine = Math.min(selection.startLineNumber, selection.endLineNumber);
  const endLine = Math.max(selection.startLineNumber, selection.endLineNumber);
  const replaceThroughNextLine = endLine < model.getLineCount();
  editor.executeEdits(source, [{
    range: {
      startLineNumber: startLine,
      startColumn: 1,
      endLineNumber: replaceThroughNextLine ? endLine + 1 : endLine,
      endColumn: replaceThroughNextLine ? 1 : model.getLineMaxColumn(endLine),
    },
    text: block.text,
    forceMoveMarkers: true,
  }]);
  setCursorAtInsertedBlockEnd(editor, startLine, block.lines);
  editor.focus();
}
