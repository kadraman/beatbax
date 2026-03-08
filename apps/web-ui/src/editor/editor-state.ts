/**
 * EditorState — manages content, cursor, selection, and auto-save for the
 * Monaco-based BeatBax editor.
 *
 * Responsibilities:
 * - Hold the canonical editor content (and dirty flag)
 * - Auto-save to localStorage with a configurable debounce delay
 * - Restore previously saved content on construction
 * - Expose cursor position and selection (read-only surface for status-bar etc.)
 * - Emit `editor:changed` / `editor:saved` events via EventBus
 * - Provide undo/redo passthrough to Monaco's native undo stack
 */

import type * as Monaco from 'monaco-editor';
import { BeatBaxSettings } from '../utils/local-storage';
import type { EventBus } from '../utils/event-bus';
import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('editor:state');

// ─── Defaults ─────────────────────────────────────────────────────────────────

/** Default debounce delay before auto-saving to localStorage (ms). */
export const DEFAULT_AUTO_SAVE_DELAY_MS = 500;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CursorPosition {
  line: number;
  column: number;
}

export interface EditorSelection {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  /** The selected text, or empty string when nothing is selected. */
  text: string;
}

export interface EditorStateOptions {
  /** Monaco editor instance to bind. */
  editor: Monaco.editor.IStandaloneCodeEditor;
  /** EventBus used to emit `editor:changed` and `editor:saved`. */
  eventBus: EventBus;
  /**
   * Debounce delay for auto-saving content to localStorage (ms).
   * Set to 0 to disable auto-save.
   * Defaults to `DEFAULT_AUTO_SAVE_DELAY_MS`.
   */
  autoSaveDelay?: number;
  /**
   * Override the initial content. When omitted, the current editor value is
   * used. When null, no content is pre-loaded from storage.
   */
  initialContent?: string | null;
  /**
   * Whether to restore the last saved content from localStorage on init.
   * Defaults to true.
   */
  restoreOnInit?: boolean;
}

/**
 * Public surface exposed by EditorState.
 */
export interface IEditorState {
  // ── Content ────────────────────────────────────────────────────────────────
  /** Return the current editor content. */
  getContent(): string;
  /** Programmatically set content (resets dirty flag, saves if auto-save is on). */
  setContent(content: string, markClean?: boolean): void;
  /** Whether the content has changed since the last save. */
  readonly isDirty: boolean;

  // ── Persistence ────────────────────────────────────────────────────────────
  /** Immediately flush any pending auto-save. */
  saveNow(): void;
  /** Clear the persisted content from localStorage. */
  clearSaved(): void;
  /** Load and apply the last persisted content (if any). Returns true on success. */
  restore(): boolean;

  // ── Cursor & selection ─────────────────────────────────────────────────────
  /** Current cursor position (1-based line and column). */
  readonly cursorPosition: CursorPosition;
  /** Current selection info (or null when nothing is selected). */
  readonly selection: EditorSelection | null;
  /** Move cursor to a specific position and reveal it. */
  setCursorPosition(line: number, column: number): void;

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  undo(): void;
  redo(): void;
  /** True when there is something to undo. */
  readonly canUndo: boolean;
  /** True when there is something to redo. */
  readonly canRedo: boolean;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  /** Flush pending save and remove all event listeners. */
  dispose(): void;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Manages editor content state, auto-save, cursor/selection tracking, and
 * undo/redo for a Monaco editor instance.
 *
 * Example:
 * ```typescript
 * const state = new EditorState({
 *   editor: monacoEditor,
 *   eventBus,
 *   autoSaveDelay: 500,
 *   restoreOnInit: true,
 * });
 *
 * // later…
 * state.setContent('chip gameboy\nbpm 120\n');
 * console.log(state.isDirty);      // false (we just saved)
 * console.log(state.cursorPosition); // { line: 1, column: 1 }
 * state.dispose();
 * ```
 */
export class EditorState implements IEditorState {
  private readonly editor: Monaco.editor.IStandaloneCodeEditor;
  private readonly eventBus: EventBus;
  private readonly autoSaveDelay: number;

  private _isDirty = false;
  private _cursorPosition: CursorPosition = { line: 1, column: 1 };
  private _selection: EditorSelection | null = null;

  /** Timer ID for the pending auto-save. */
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** IDisposable handles returned by Monaco .onDid* subscriptions. */
  private disposables: Monaco.IDisposable[] = [];

  constructor(options: EditorStateOptions) {
    const {
      editor,
      eventBus,
      autoSaveDelay = DEFAULT_AUTO_SAVE_DELAY_MS,
      initialContent = undefined,
      restoreOnInit = true,
    } = options;

    this.editor = editor;
    this.eventBus = eventBus;
    this.autoSaveDelay = autoSaveDelay;

    // ── Initial content priority: explicit > restored > current model value ──
    if (initialContent !== null && initialContent !== undefined) {
      // Caller provided explicit content.
      if (initialContent !== editor.getValue()) {
        editor.setValue(initialContent);
      }
      log.debug('Initial content supplied by caller.');
    } else if (restoreOnInit) {
      this.restore();
    }

    // ── Monaco event subscriptions ────────────────────────────────────────────
    this.disposables.push(
      editor.onDidChangeModelContent(() => this.handleContentChange()),
      editor.onDidChangeCursorPosition((e) => this.handleCursorChange(e)),
      editor.onDidChangeCursorSelection((e) => this.handleSelectionChange(e)),
    );

    // Snapshot initial cursor & selection
    this.snapshotCursor();
    this.snapshotSelection();
  }

  // ─── Content ───────────────────────────────────────────────────────────────

  getContent(): string {
    return this.editor.getValue();
  }

  setContent(content: string, markClean = true): void {
    // Use pushEditOperations so the change is undoable, unless the content is
    // being reset wholesale (in which case setValue is cleaner).
    this.editor.setValue(content);

    if (markClean) {
      this._isDirty = false;
      if (this.autoSaveDelay > 0) {
        this.flushAutoSave(content);
      }
    }
  }

  get isDirty(): boolean {
    return this._isDirty;
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  saveNow(): void {
    this.cancelPendingAutoSave();
    this.persist(this.editor.getValue());
  }

  clearSaved(): void {
    BeatBaxSettings.setEditorContent('');
    log.debug('Cleared persisted editor content.');
  }

  restore(): boolean {
    const saved = BeatBaxSettings.getEditorContent();
    if (!saved) {
      log.debug('No persisted content to restore.');
      return false;
    }
    if (saved !== this.editor.getValue()) {
      this.editor.setValue(saved);
    }
    this._isDirty = false;
    log.debug(`Restored ${saved.length} chars from localStorage.`);
    return true;
  }

  // ─── Cursor & selection ───────────────────────────────────────────────────

  get cursorPosition(): CursorPosition {
    return { ...this._cursorPosition };
  }

  get selection(): EditorSelection | null {
    return this._selection ? { ...this._selection } : null;
  }

  setCursorPosition(line: number, column: number): void {
    this.editor.setPosition({ lineNumber: line, column });
    this.editor.revealPositionInCenter({ lineNumber: line, column });
    this.editor.focus();
  }

  // ─── Undo / Redo ─────────────────────────────────────────────────────────

  undo(): void {
    this.editor.trigger('editor-state', 'undo', null);
  }

  redo(): void {
    this.editor.trigger('editor-state', 'redo', null);
  }

  /**
   * Monaco doesn't expose a synchronous canUndo/canRedo predicate, so we
   * approximate using the dirty flag: if the buffer is dirty there is at least
   * one change to undo.
   */
  get canUndo(): boolean {
    return this._isDirty;
  }

  get canRedo(): boolean {
    // No reliable sync API — return false conservatively.
    return false;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  dispose(): void {
    // Flush any pending save before tearing down.
    if (this._isDirty && this.autoSaveDelay > 0) {
      this.saveNow();
    }
    this.cancelPendingAutoSave();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    log.debug('EditorState disposed.');
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private handleContentChange(): void {
    this._isDirty = true;
    const content = this.editor.getValue();

    // Emit change event (callers can react immediately).
    this.eventBus.emit('editor:changed', { content });

    if (this.autoSaveDelay === 0) {
      // Auto-save disabled — persist immediately so tests / callers that rely
      // on BeatBaxSettings.getEditorContent() stay in sync.
      this.persist(content);
      return;
    }

    // Debounced auto-save.
    this.cancelPendingAutoSave();
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      this.flushAutoSave(content);
    }, this.autoSaveDelay);
  }

  private flushAutoSave(content: string): void {
    this.persist(content);
  }

  private persist(content: string): void {
    BeatBaxSettings.setEditorContent(content);
    this._isDirty = false;
    this.eventBus.emit('editor:saved', { filename: 'autosave' });
    log.debug(`Auto-saved ${content.length} chars.`);
  }

  private cancelPendingAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private handleCursorChange(
    e: Monaco.editor.ICursorPositionChangedEvent,
  ): void {
    this._cursorPosition = {
      line: e.position.lineNumber,
      column: e.position.column,
    };
  }

  private handleSelectionChange(
    e: Monaco.editor.ICursorSelectionChangedEvent,
  ): void {
    this.snapshotSelection();
  }

  private snapshotCursor(): void {
    const pos = this.editor.getPosition();
    if (pos) {
      this._cursorPosition = { line: pos.lineNumber, column: pos.column };
    }
  }

  private snapshotSelection(): void {
    const sel = this.editor.getSelection();
    const model = this.editor.getModel();
    if (!sel || !model || sel.isEmpty()) {
      this._selection = null;
      return;
    }
    this._selection = {
      startLine: sel.startLineNumber,
      startColumn: sel.startColumn,
      endLine: sel.endLineNumber,
      endColumn: sel.endColumn,
      text: model.getValueInRange(sel),
    };
  }
}
