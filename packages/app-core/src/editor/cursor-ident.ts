import type * as monaco from 'monaco-editor';

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Identifier at a 1-based column on a single source line. */
export function getIdentifierAtColumn(line: string, column: number): string | null {
  const col = column - 1;
  const re = /[A-Za-z_][A-Za-z0-9_]*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (col >= start && col < end) return match[0];
  }
  return null;
}

/** Identifier under the cursor, including when Monaco word segmentation misses it. */
export function getIdentifierAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
): string | null {
  const word = model.getWordAtPosition(position)?.word;
  if (word && IDENTIFIER_RE.test(word)) return word;

  return getIdentifierAtColumn(model.getLineContent(position.lineNumber), position.column);
}

export function isValidBeatBaxIdentifier(name: string): boolean {
  return IDENTIFIER_RE.test(name);
}
