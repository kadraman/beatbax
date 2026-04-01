/**
 * editor.store — editor content and dirty-flag state (nanostores).
 *
 * Replaces EditorState event-bus emissions for consumers that only need to
 * read the current content or dirty flag reactively (e.g., status-bar badges).
 *
 * The Monaco EditorState instance remains the authoritative owner of the
 * editor model; this store is kept in sync via EditorState → subscribe.
 *
 * localStorage key: 'beatbax:editor.content'
 */

import { atom } from 'nanostores';

const STORAGE_KEY = 'beatbax:editor.content';

/** Current content of the editor. */
export const editorContent = atom<string>('');

/** Whether the content has unsaved changes. */
export const editorDirty = atom<boolean>(false);

/** Filename of the currently open document (empty string = untitled). */
export const editorFilename = atom<string>('');

/** Persist content to localStorage on every change. */
editorContent.subscribe((content) => {
  try {
    localStorage.setItem(STORAGE_KEY, content);
  } catch { /* ignore */ }
});
