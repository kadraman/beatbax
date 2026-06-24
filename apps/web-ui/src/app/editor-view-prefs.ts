import type * as monaco from 'monaco-editor';
import { settingFoldComments, settingWordWrap } from '@beatbax/app-core/stores/settings.store';

export interface EditorViewToolbarHandle {
  setWrapActive: (wrap: boolean) => void;
  setFoldCommentsActive: (folded: boolean) => void;
}

export function applyCommentsFoldPreference(
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
  folded = settingFoldComments.get(),
  toolbar?: EditorViewToolbarHandle | null,
): void {
  if (!editor) return;
  if (folded) {
    editor.trigger('beatbax', 'editor.foldAllBlockComments', null);
  } else {
    editor.trigger('beatbax', 'editor.unfoldAll', null);
  }
  toolbar?.setFoldCommentsActive(folded);
}

/** Folding ranges are computed asynchronously after setValue — defer when folding. */
export function scheduleCommentsFoldPreference(
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
  toolbar?: EditorViewToolbarHandle | null,
): void {
  const folded = settingFoldComments.get();
  if (!folded) {
    applyCommentsFoldPreference(editor, false, toolbar);
    return;
  }
  const fold = () => applyCommentsFoldPreference(editor, true, toolbar);
  requestAnimationFrame(() => requestAnimationFrame(fold));
  window.setTimeout(fold, 100);
}

export function applyStoredWordWrap(
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
): void {
  editor?.updateOptions({ wordWrap: settingWordWrap.get() ? 'on' : 'off' });
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
