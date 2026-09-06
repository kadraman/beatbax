import * as monaco from 'monaco-editor';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import { findInstLineIndex } from '@beatbax/app-core/editor/instrument-editor-writeback';

export interface InstrumentEditorNavOptions {
  focus?: boolean;
  /** Scroll the line into view (default true when focusing, else true). */
  reveal?: boolean;
}

export interface InstrumentEditorNavHandle {
  /** Highlight (and optionally reveal/focus) the `inst <name>` definition line. */
  sync: (name: string | null, opts?: InstrumentEditorNavOptions) => void;
  dispose: () => void;
}

/**
 * Persistent Monaco highlight for the Instrument Editor's selected `inst` line.
 */
export function setupInstrumentEditorNav(
  getEditor: () => BeatBaxEditor | null | undefined,
): InstrumentEditorNavHandle {
  let decorationCollection: monaco.editor.IEditorDecorationsCollection | null = null;

  const clear = (): void => {
    decorationCollection?.clear();
    decorationCollection = null;
  };

  const sync = (name: string | null, opts: InstrumentEditorNavOptions = {}): void => {
    const monacoEditor = getEditor()?.editor;
    const model = monacoEditor?.getModel();
    if (!monacoEditor || !model || !name) {
      clear();
      return;
    }

    const idx = findInstLineIndex(model.getValue(), name);
    if (idx < 0) {
      clear();
      return;
    }

    const line = idx + 1;
    const focus = opts.focus === true;
    const reveal = opts.reveal !== false;

    clear();
    decorationCollection = monacoEditor.createDecorationsCollection([
      {
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: model.getLineMaxColumn(line),
        },
        options: {
          isWholeLine: true,
          className: 'bb-inst-editor-active-line',
          overviewRuler: {
            color: 'rgba(52, 211, 153, 0.55)',
            position: monaco.editor.OverviewRulerLane.Center,
          },
        },
      },
    ]);

    if (reveal) monacoEditor.revealLineInCenter(line);
    if (focus) {
      monacoEditor.setPosition({ lineNumber: line, column: 1 });
      monacoEditor.focus();
    }
  };

  return {
    sync,
    dispose: clear,
  };
}
