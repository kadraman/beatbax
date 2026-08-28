import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import type { ShortcutHandlers } from '@beatbax/app-core/shortcuts';
import type { SectionFocusController } from './section-focus-controller';
import { KeyCode, type editor as MonacoEditor } from 'monaco-editor';
export interface PatternGridShortcutHandlersOptions {
  getSectionFocusController: () => SectionFocusController | null;
  getEditor: () => BeatBaxEditor | null;
  onStatus?: (message: string) => void;
}

export function createPatternGridShortcutHandlers(
  options: PatternGridShortcutHandlersOptions,
): ShortcutHandlers {
  const focusSectionAtCursor = (): void => {
    const controller = options.getSectionFocusController();
    if (!controller) {
      options.onStatus?.('Parse the song and enable Pattern Grid to focus sections');
      return;
    }
    const monacoEditor = options.getEditor()?.editor;
    const pos = monacoEditor?.getPosition();
    if (!pos) {
      options.onStatus?.('No cursor position in editor');
      return;
    }
    controller.focusAtCursor(pos.lineNumber, pos.column, { play: false });
  };

  return {
    'patternGrid.focusSectionAtCursor': focusSectionAtCursor,
    'patternGrid.exitSectionFocus': () => {
      if (!options.getSectionFocusController()?.isActive()) return;
      options.getSectionFocusController()?.exit();
    },
    'patternGrid.previousSection': () => {
      if (!options.getSectionFocusController()?.isActive()) return;
      options.getSectionFocusController()?.focusAdjacentSection('prev');
    },
    'patternGrid.nextSection': () => {
      if (!options.getSectionFocusController()?.isActive()) return;
      options.getSectionFocusController()?.focusAdjacentSection('next');
    },
  };
}

/** Direct Monaco key handlers — avoids catalog/chord registration gaps. */
export function bindPatternGridEditorKeys(
  editor: MonacoEditor.IStandaloneCodeEditor,
  handlers: ReturnType<typeof createPatternGridShortcutHandlers>,
): () => void {
  const onKeyDown = editor.onKeyDown((event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;

    if (event.keyCode === KeyCode.F6) {
      handlers['patternGrid.focusSectionAtCursor']?.();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!event.altKey) return;

    if (event.keyCode === KeyCode.LeftArrow) {
      handlers['patternGrid.previousSection']?.();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.keyCode === KeyCode.RightArrow) {
      handlers['patternGrid.nextSection']?.();
      event.preventDefault();
      event.stopPropagation();
    }
  });

  return () => onKeyDown.dispose();
}
