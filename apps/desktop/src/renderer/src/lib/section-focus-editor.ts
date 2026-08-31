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

  const clearDecorations = (): void => {
    decorationCollection?.clear();
    decorationCollection = null;
  };

  const clearFocus = (): void => {
    clearDecorations();
  };

  const applyFocus = (info: SectionFocusInfo): void => {
    const monacoEditor = getEditor()?.editor;
    const model = monacoEditor?.getModel();
    if (!monacoEditor || !model) return;

    clearDecorations();

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    const seqLines = [...info.seqDefinitionLines].sort((a, b) => a - b);

    if (info.commentLine) {
      const line = info.commentLine;
      decorations.push({
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: model.getLineMaxColumn(line),
        },
        options: {
          isWholeLine: true,
          className: 'bb-section-focus-line bb-section-focus-line--header',
          inlineClassName: 'bb-section-focus-inline',
          overviewRuler: {
            color: 'rgba(255, 190, 70, 0.85)',
            position: monaco.editor.OverviewRulerLane.Full,
          },
        },
      });
    }

    if (seqLines.length > 0) {
      const blockStart = Math.min(...seqLines);
      const blockEnd = Math.max(...seqLines);
      decorations.push({
        range: {
          startLineNumber: blockStart,
          startColumn: 1,
          endLineNumber: blockEnd,
          endColumn: model.getLineMaxColumn(blockEnd),
        },
        options: {
          isWholeLine: true,
          className: 'bb-section-focus-line bb-section-focus-line--block',
          inlineClassName: 'bb-section-focus-inline',
          overviewRuler: {
            color: 'rgba(255, 190, 70, 0.85)',
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
    const model = monacoEditor?.getModel();
    if (!monacoEditor || !model) return;

    const lines = info.seqDefinitionLines;
    const blockStart = info.commentLine ?? (lines.length > 0 ? Math.min(...lines) : null);
    const blockEnd = lines.length > 0 ? Math.max(...lines) : blockStart;
    if (blockStart && blockEnd) {
      monacoEditor.revealRangeInCenter({
        startLineNumber: blockStart,
        startColumn: 1,
        endLineNumber: blockEnd,
        endColumn: model.getLineMaxColumn(blockEnd),
      });
    }

    const targetLine = lines[0] ?? blockStart;
    if (!targetLine) return;
    monacoEditor.setPosition({ lineNumber: targetLine, column: 1 });
  };

  return {
    applyFocus,
    revealFocus,
    clearFocus,
    dispose: clearFocus,
  };
}
