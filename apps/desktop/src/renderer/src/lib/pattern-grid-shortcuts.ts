import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import type { ShortcutHandlers } from '@beatbax/app-core/shortcuts';
import type { SectionFocusController } from './section-focus-controller';
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
