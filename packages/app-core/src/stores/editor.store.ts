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
import type { ValidationIssue } from '../types/validation.js';

const STORAGE_KEY = 'beatbax:editor.content';

// ── Parse / validation state ──────────────────────────────────────────────────

export type ParseStatus = 'idle' | 'parsing' | 'success' | 'error';

/** Current parse pipeline status. */
export const parseStatus = atom<ParseStatus>('idle');

/** BPM extracted from the most recently parsed AST. */
export const parsedBpm = atom<number>(120);

/** Chip name extracted from the most recently parsed AST. */
export const parsedChip = atom<string>('gameboy');

/** Current validation error list (empty when none). */
export const validationErrors = atom<ValidationIssue[]>([]);

/** Current validation warning list (empty when none). */
export const validationWarnings = atom<ValidationIssue[]>([]);

// ── Editor content ────────────────────────────────────────────────────────────

/** Current content of the editor. */
export const editorContent = atom<string>('');

/** Whether the content has unsaved changes. */
export const editorDirty = atom<boolean>(false);

/** Disk save feedback for the status bar (desktop auto-save and manual save). */
export type DocumentSaveState = 'idle' | 'saving' | 'saved' | 'error';

export const documentSaveState = atom<DocumentSaveState>('idle');

/** Filename of the currently open document (empty string = untitled). */
export const editorFilename = atom<string>('');

/** Persist content to localStorage on every change. */
editorContent.subscribe((content) => {
  if (content === '') return; // Don't persist empty content (e.g., on initialization)
  // Persist the content to localStorage for auto-recovery on reload.
  try {
    localStorage.setItem(STORAGE_KEY, content);
  } catch { /* ignore */ }
});
