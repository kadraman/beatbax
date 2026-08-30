import * as monaco from 'monaco-editor';
import type { SectionFocusInfo } from '@beatbax/app-core/editor/arrangement-slice';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';

export interface SectionFocusEditorHandle {
  applyFocus: (info: SectionFocusInfo) => void;
  revealFocus: (info: SectionFocusInfo) => void;
  clearFocus: () => void;
  dispose: () => void;
}

/**
 * Monaco decorations for the active Pattern Grid section focus.
 */
export function setupSectionFocusEditor(
  getEditor: () => BeatBaxEditor | null | undefined,
): SectionFocusEditorHandle {
  let decorationCollection: monaco.editor.IEditorDecorationsCollection | null = null;

  const clearFocus = (): void => {
    decorationCollection?.clear();
    decorationCollection = null;
  };

  const applyFocus = (info: SectionFocusInfo): void => {
    const monacoEditor = getEditor()?.editor;
    if (!monacoEditor) return;

    clearFocus();

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];

    if (info.commentLine) {
      decorations.push({
        range: {
          startLineNumber: info.commentLine,
          startColumn: 1,
          endLineNumber: info.commentLine,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'bb-section-focus-line bb-section-focus-line--header',
          overviewRuler: {
            color: 'rgba(200, 170, 110, 0.55)',
            position: monaco.editor.OverviewRulerLane.Full,
          },
        },
      });
    }

    for (const line of info.seqDefinitionLines) {
      decorations.push({
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'bb-section-focus-line',
          overviewRuler: {
            color: 'rgba(200, 170, 110, 0.55)',
            position: monaco.editor.OverviewRulerLane.Full,
          },
        },
      });
    }

    if (decorations.length > 0) {
      decorationCollection = monacoEditor.createDecorationsCollection(decorations);
    }
  };

  const revealFocus = (info: SectionFocusInfo): void => {
    const monacoEditor = getEditor()?.editor;
    if (!monacoEditor) return;
    const targetLine = info.commentLine ?? info.seqDefinitionLines[0];
    if (!targetLine) return;
    monacoEditor.revealLineInCenter(targetLine);
    monacoEditor.setPosition({ lineNumber: targetLine, column: 1 });
  };

  return {
    applyFocus,
    revealFocus,
    clearFocus,
    dispose: clearFocus,
  };
}
