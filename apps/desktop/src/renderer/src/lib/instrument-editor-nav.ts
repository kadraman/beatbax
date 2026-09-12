import * as monaco from 'monaco-editor';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import { findInstLineIndex, findSubpatLineIndex } from '@beatbax/app-core/editor/instrument-editor-writeback';

export interface InstrumentEditorNavOptions {
  focus?: boolean;
  /** Scroll the line into view (default true). */
  reveal?: boolean;
}

export interface InstrumentEditorNavHandle {
  /** Highlight (and optionally reveal/focus) the `inst <name>` definition line. */
  sync: (name: string | null, opts?: InstrumentEditorNavOptions) => void;
  /** Highlight / reveal / focus a `subpat <name>` definition. */
  syncSubpat: (name: string, opts?: InstrumentEditorNavOptions) => void;
  dispose: () => void;
}

type NavKind = 'inst' | 'subpat';

interface NavPin {
  kind: NavKind;
  name: string;
}

function lineFor(source: string, kind: NavKind, name: string): number {
  const idx = kind === 'subpat' ? findSubpatLineIndex(source, name) : findInstLineIndex(source, name);
  return idx < 0 ? -1 : idx + 1;
}

/**
 * Persistent Monaco highlight for the Instrument Editor's selected definition.
 * The go-to-source control on a Game Boy `subpat=` field pins the highlight to
 * the `subpat` line so a same-named `inst` does not steal it. Silent resyncs
 * (parse:success, writeback) keep that pin; an explicit inst reveal (dropdown,
 * toolbar Show in editor) returns to the `inst` line.
 */
export function setupInstrumentEditorNav(
  getEditor: () => BeatBaxEditor | null | undefined,
): InstrumentEditorNavHandle {
  let decorationCollection: monaco.editor.IEditorDecorationsCollection | null = null;
  let pin: NavPin | null = null;
  let lastInstName: string | null = null;

  const clear = (): void => {
    decorationCollection?.clear();
    decorationCollection = null;
  };

  const apply = (next: NavPin | null, opts: InstrumentEditorNavOptions): void => {
    const monacoEditor = getEditor()?.editor;
    const model = monacoEditor?.getModel();
    if (!monacoEditor || !model || !next) {
      clear();
      return;
    }

    const line = lineFor(model.getValue(), next.kind, next.name);
    if (line < 0) {
      clear();
      return;
    }

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

    if (!reveal && !focus) return;

    const go = (): void => {
      if (focus) {
        monacoEditor.setPosition({ lineNumber: line, column: 1 });
        monacoEditor.focus();
      }
      if (reveal) monacoEditor.revealLineInCenter(line);
    };
    window.requestAnimationFrame(go);
  };

  const sync = (name: string | null, opts: InstrumentEditorNavOptions = {}): void => {
    if (!name) {
      pin = null;
      lastInstName = null;
      apply(null, opts);
      return;
    }
    const instChanged = lastInstName !== name;
    lastInstName = name;
    const explicitInst = opts.reveal === true || opts.focus === true || instChanged;
    if (!explicitInst && pin?.kind === 'subpat') {
      apply(pin, { focus: false, reveal: false });
      return;
    }
    pin = { kind: 'inst', name };
    apply(pin, opts);
  };

  const syncSubpat = (name: string, opts: InstrumentEditorNavOptions = {}): void => {
    pin = { kind: 'subpat', name };
    apply(pin, { reveal: true, focus: true, ...opts });
  };

  return {
    sync,
    syncSubpat,
    dispose: () => {
      pin = null;
      lastInstName = null;
      clear();
    },
  };
}
