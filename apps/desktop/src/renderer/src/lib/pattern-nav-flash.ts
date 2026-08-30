import * as monaco from 'monaco-editor';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';

const FLASH_MS = 720;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findPatDefinitionLine(fullSource: string, patName: string): number | null {
  const lines = fullSource.split('\n');
  const re = new RegExp(`^\\s*pat\\s+${escapeRegex(patName)}\\s*=`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return null;
}

export interface PatternNavFlashHandle {
  flashPat: (patName: string) => void;
  dispose: () => void;
}

/**
 * Brief Monaco flash when jumping to a `pat` from the Pattern Grid.
 */
export function setupPatternNavFlash(
  getEditor: () => BeatBaxEditor | null | undefined,
  getSource: () => string,
): PatternNavFlashHandle {
  let decorationCollection: monaco.editor.IEditorDecorationsCollection | null = null;
  let clearTimer: number | null = null;

  const clearFlash = (): void => {
    if (clearTimer !== null) {
      window.clearTimeout(clearTimer);
      clearTimer = null;
    }
    decorationCollection?.clear();
    decorationCollection = null;
  };

  const flashPat = (patName: string): void => {
    const monacoEditor = getEditor()?.editor;
    if (!monacoEditor) return;

    const line = findPatDefinitionLine(getSource(), patName);
    if (!line) return;

    clearFlash();

    monacoEditor.revealLineInCenter(line);
    monacoEditor.setPosition({ lineNumber: line, column: 1 });
    monacoEditor.focus();

    decorationCollection = monacoEditor.createDecorationsCollection([
      {
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'bb-pat-nav-flash',
        },
      },
    ]);

    clearTimer = window.setTimeout(() => {
      clearFlash();
    }, FLASH_MS);
  };

  return {
    flashPat,
    dispose: clearFlash,
  };
}
