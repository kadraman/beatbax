import * as monaco from 'monaco-editor';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';

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
  /** Highlight a `pat` definition until cleared; `null` clears. Reveals when setting a name. */
  setPat: (patName: string | null, options?: { reveal?: boolean }) => void;
  /** Re-apply the active highlight after the source changes. */
  refresh: () => void;
  dispose: () => void;
}

/**
 * Monaco highlight when a Pattern Grid pattern is selected.
 * Stays until the grid clears the selection (or the pat disappears).
 */
export function setupPatternNavFlash(
  getEditor: () => BeatBaxEditor | null | undefined,
  getSource: () => string,
): PatternNavFlashHandle {
  let decorationCollection: monaco.editor.IEditorDecorationsCollection | null = null;
  let activePatName: string | null = null;

  const clearDecorations = (): void => {
    decorationCollection?.clear();
    decorationCollection = null;
  };

  const applyDecoration = (patName: string, reveal: boolean): void => {
    const monacoEditor = getEditor()?.editor;
    if (!monacoEditor) return;

    const line = findPatDefinitionLine(getSource(), patName);
    if (!line) {
      clearDecorations();
      return;
    }

    if (reveal) {
      monacoEditor.revealLineInCenter(line);
      monacoEditor.setPosition({ lineNumber: line, column: 1 });
      monacoEditor.focus();
    }

    clearDecorations();
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
          className: reveal ? 'bb-pat-nav-highlight bb-pat-nav-highlight--flash' : 'bb-pat-nav-highlight',
        },
      },
    ]);
  };

  const setPat = (patName: string | null, options?: { reveal?: boolean }): void => {
    activePatName = patName;
    if (!patName) {
      clearDecorations();
      return;
    }
    applyDecoration(patName, options?.reveal !== false);
  };

  const refresh = (): void => {
    if (!activePatName) return;
    applyDecoration(activePatName, false);
  };

  return {
    setPat,
    refresh,
    dispose: () => {
      activePatName = null;
      clearDecorations();
    },
  };
}
