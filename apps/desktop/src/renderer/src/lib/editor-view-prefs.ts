import type * as monaco from 'monaco-editor';
import {
  EDITOR_FONT_SIZE_DEFAULT,
  clampEditorFontSize,
  editorViewMonacoOptions,
  editorWheelZoomModifierActive,
  platformMonacoFontFamily,
  stepEditorFontSize,
} from '@beatbax/app-core/editor/editor-view-options';
import { refreshEditorFolding } from '@beatbax/app-core/editor/editor-folding';
import {
  settingEditorCursorStyle,
  settingEditorFontFamily,
  settingEditorIndentGuides,
  settingEditorLineNumbers,
  settingEditorMinimap,
  settingEditorMouseWheelZoom,
  settingEditorTabSize,
  settingEditorWhitespace,
  settingFoldComments,
  settingFontSize,
  settingWordWrap,
} from '@beatbax/app-core/stores/settings.store';

/** Monaco EditorOption.fontSize. A const enum, so the numeric id is inlined here. */
const MONACO_FONT_SIZE_OPTION = 52;

interface FontSizeEditor {
  updateOptions: (options: monaco.editor.IEditorOptions) => void;
  getOption: (id: number) => unknown;
  onDidChangeConfiguration: (
    listener: (event: { hasChanged: (id: number) => boolean }) => void,
  ) => { dispose: () => void };
}

export interface EditorViewToolbarHandle {
  setWrapActive: (wrap: boolean) => void;
  setFoldCommentsActive: (folded: boolean) => void;
}

export function applyCommentsFoldPreference(
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
  folded = settingFoldComments.get(),
  toolbar?: EditorViewToolbarHandle | null,
): void {
  refreshEditorFolding(editor, folded);
  toolbar?.setFoldCommentsActive(folded);
}

/** Folding ranges are computed asynchronously after setValue - defer when folding. */
export function scheduleCommentsFoldPreference(
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
  toolbar?: EditorViewToolbarHandle | null,
): void {
  refreshEditorFolding(editor, settingFoldComments.get());
  toolbar?.setFoldCommentsActive(settingFoldComments.get());
}

export function applyStoredWordWrap(
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
): void {
  editor?.updateOptions({ wordWrap: settingWordWrap.get() ? 'on' : 'off' });
}

export function applyStoredEditorView(
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
): void {
  const options = editorViewMonacoOptions({
    fontFamily: settingEditorFontFamily.get(),
    tabSize: settingEditorTabSize.get() === 4 ? 4 : 2,
    minimap: settingEditorMinimap.get(),
    lineNumbers: settingEditorLineNumbers.get(),
    whitespace: settingEditorWhitespace.get(),
    indentGuides: settingEditorIndentGuides.get(),
    cursorStyle: settingEditorCursorStyle.get(),
    fontSize: settingFontSize.get(),
    mouseWheelZoom: settingEditorMouseWheelZoom.get(),
  }, platformMonacoFontFamily());
  // Monaco's own flag scales a separate zoom level and still lets Windows scroll.
  // The Desktop listener below writes the shared font size instead.
  editor?.updateOptions({ ...options, mouseWheelZoom: false });
}

export function setEditorFontSize(
  size: number,
  editor?: monaco.editor.IStandaloneCodeEditor | null,
): void {
  settingFontSize.set(size);
  editor?.updateOptions({ fontSize: settingFontSize.get() });
}

export function zoomEditorFont(
  action: 'in' | 'out' | 'reset',
  editor?: monaco.editor.IStandaloneCodeEditor | null,
): void {
  if (action === 'reset') {
    setEditorFontSize(EDITOR_FONT_SIZE_DEFAULT, editor);
    return;
  }
  setEditorFontSize(stepEditorFontSize(settingFontSize.get(), action === 'in' ? 1 : -1), editor);
}

function wheelModifierKeys(event: WheelEvent, held: ReadonlySet<string>) {
  return {
    ctrl: event.ctrlKey || held.has('Control'),
    meta: event.metaKey || held.has('Meta'),
    shift: event.shiftKey || held.has('Shift'),
    alt: event.altKey || held.has('Alt'),
  };
}

/**
 * Ctrl/Cmd + wheel changes the shared font size. The plain wheel still scrolls.
 * The modifier is also tracked from keydown because Windows wheel events often
 * arrive without ctrlKey, so Monaco's built-in zoom never runs and the editor scrolls.
 */
export function bindEditorMouseWheelZoom(
  editor: monaco.editor.IStandaloneCodeEditor,
): () => void {
  const node = editor.getDomNode();
  if (!node) return () => undefined;
  const held = new Set<string>();
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform ?? '');
  let lastStep = 0;
  const onKeyDown = (event: KeyboardEvent) => { held.add(event.key); };
  const onKeyUp = (event: KeyboardEvent) => { held.delete(event.key); };
  const onBlur = () => { held.clear(); };
  const onWheel = (event: WheelEvent) => {
    if (!settingEditorMouseWheelZoom.get()) return;
    const target = event.target;
    if (!(target instanceof Node) || !node.contains(target)) return;
    if (!editorWheelZoomModifierActive(wheelModifierKeys(event, held), mac)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.deltaY === 0) return;
    const now = Date.now();
    if (now - lastStep < 40) return;
    lastStep = now;
    zoomEditorFont(event.deltaY > 0 ? 'out' : 'in', editor);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('wheel', onWheel, { capture: true });
  };
}

/** Keep the shared font-size preference aligned when Monaco changes it (wheel zoom). */
export function bindEditorFontSizePreference(editor: FontSizeEditor): () => void {
  const sub = editor.onDidChangeConfiguration((event) => {
    if (!event.hasChanged(MONACO_FONT_SIZE_OPTION)) return;
    const shown = Number(editor.getOption(MONACO_FONT_SIZE_OPTION));
    const clamped = clampEditorFontSize(shown);
    if (clamped !== shown) {
      editor.updateOptions({ fontSize: clamped });
      return;
    }
    if (settingFontSize.get() !== clamped) settingFontSize.set(clamped);
  });
  return () => sub.dispose();
}

export function syncEditorViewPrefsToToolbar(toolbar: EditorViewToolbarHandle | null | undefined): void {
  if (!toolbar) return;
  toolbar.setWrapActive(settingWordWrap.get());
  toolbar.setFoldCommentsActive(settingFoldComments.get());
}

export function toggleWordWrap(
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
  toolbar?: EditorViewToolbarHandle | null,
): boolean {
  const wrap = !settingWordWrap.get();
  settingWordWrap.set(wrap);
  editor?.updateOptions({ wordWrap: wrap ? 'on' : 'off' });
  toolbar?.setWrapActive(wrap);
  return wrap;
}

export function toggleFoldAllComments(
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
  toolbar?: EditorViewToolbarHandle | null,
): boolean {
  const folded = !settingFoldComments.get();
  settingFoldComments.set(folded);
  if (folded) {
    scheduleCommentsFoldPreference(editor, toolbar);
  } else {
    applyCommentsFoldPreference(editor, false, toolbar);
  }
  return folded;
}

export interface EditorViewPrefsHandlers {
  onToggleWrap: (wrap: boolean) => void;
  onToggleFoldComments: () => void;
  onToggleWrapText: () => void;
  onToggleFoldAll: () => void;
}

export function createEditorViewPrefsHandlers(
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null | undefined,
  toolbar?: EditorViewToolbarHandle | null,
): EditorViewPrefsHandlers {
  return {
    onToggleWrap: (wrap) => {
      settingWordWrap.set(wrap);
      getEditor()?.updateOptions({ wordWrap: wrap ? 'on' : 'off' });
      toolbar?.setWrapActive(wrap);
    },
    onToggleFoldComments: () => {
      toggleFoldAllComments(getEditor(), toolbar);
    },
    onToggleWrapText: () => {
      toggleWordWrap(getEditor(), toolbar);
    },
    onToggleFoldAll: () => {
      toggleFoldAllComments(getEditor(), toolbar);
    },
  };
}
