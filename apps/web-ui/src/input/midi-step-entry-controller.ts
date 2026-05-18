/**
 * MIDI Step Entry Controller
 *
 * Bridges MidiStepEntryService (pure MIDI logic) with the Monaco editor.
 *
 * Responsibilities:
 *  - Own the MidiStepEntryService lifecycle
 *  - React to note-on events by inserting/replacing tokens in Monaco
 *  - Handle editor context checks (is cursor inside a pat body?)
 *  - Manage the transport record-button armed/disarmed visual state
 *  - Provide audition playback via the onAuditionNote callback
 *  - Expose a stable public API consumed by main.ts, settings, and
 *    command-palette commands (via window.__beatbax_midiStepEntry)
 */

import * as monaco from 'monaco-editor';
import { createLogger } from '@beatbax/engine/util/logger';
import {
  MidiStepEntryService,
  isCursorInsidePatBody,
  extractNoteTokenSpans,
  formatNoteToken,
  type StepLength,
  type EntryMode,
} from './midi-step-entry';
import {
  settingMidiInputEnabled,
  settingMidiInputDevice,
  settingMidiStepLength,
  settingMidiEmitDurations,
  settingMidiEntryMode,
  settingMidiAutoAdvance,
  settingMidiAuditionNotes,
  settingMidiUseNoteDuration,
} from '../stores/settings.store';

const log = createLogger('ui:midi-controller');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MidiStepEntryControllerOptions {
  /** Returns the current Monaco editor instance (may be null during setup). */
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null;
  /** Called with a note name to trigger a brief audition playback. */
  onAuditionNote?: (noteName: string) => void;
  /** Called with a human-readable warning message. */
  onWarning?: (message: string) => void;
  /** Called when the armed state changes. Used to update the record button UI. */
  onArmedChanged?: (armed: boolean) => void;
}

// ─── MidiStepEntryController ──────────────────────────────────────────────────

/**
 * Top-level orchestrator for MIDI step entry in the BeatBax web UI.
 */
export class MidiStepEntryController {
  private service: MidiStepEntryService;
  private _accessRequested = false;
  /** Tracks the start position of the last no-advance insertion for replace-in-place. */
  private _noAdvanceStart: { lineNumber: number; startColumn: number } | null = null;

  constructor(private opts: MidiStepEntryControllerOptions) {
    this.service = new MidiStepEntryService({
      onNoteEntered: (noteName, stepLength, emitDuration) => {
        this._insertNoteInEditor(noteName, stepLength, emitDuration);
      },
      onAuditionStart: (noteName) => {
        this.opts.onAuditionNote?.(noteName);
      },
      onAuditionStop: (_noteName) => {
        // Audition stop is informational for now; the playback engine handles
        // timing, so we don't need to explicitly stop anything here.
      },
      onWarning: (message) => {
        this.opts.onWarning?.(message);
      },
    });

    // Restore persisted settings
    this.service.setStepLength(settingMidiStepLength.get() as StepLength);
    this.service.setEmitDuration(settingMidiEmitDurations.get());
    this.service.setEntryMode(settingMidiEntryMode.get() as EntryMode);
    this.service.setAutoAdvance(settingMidiAutoAdvance.get());
    this.service.setAuditionNotes(settingMidiAuditionNotes.get());
    this.service.setUseNoteDuration(settingMidiUseNoteDuration.get());
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Request MIDI access (once). Call early during app startup. */
  async requestMidiAccess(): Promise<void> {
    if (this._accessRequested) return;

    if (!settingMidiInputEnabled.get()) return;
    if (!MidiStepEntryService.isSupported()) return;

    this._accessRequested = true;

    const err = await this.service.requestAccess();
    if (err) {
      this.opts.onWarning?.(err);
      return;
    }

    // Restore previously-selected device
    const savedDevice = settingMidiInputDevice.get();
    if (savedDevice) {
      const deviceErr = this.service.setDevice(savedDevice);
      if (deviceErr) {
        log.warn('Saved MIDI device not found:', deviceErr);
      }
    }
  }

  /** Called by the settings panel when the MIDI enabled toggle changes. */
  async setEnabled(enabled: boolean): Promise<void> {
    settingMidiInputEnabled.set(enabled);
    if (enabled && !this._accessRequested) {
      await this.requestMidiAccess();
    } else if (!enabled) {
      this.service.disarm();
      this.opts.onArmedChanged?.(false);
    }
  }

  /** Called by the settings panel when the device selection changes. */
  setDeviceById(deviceId: string): void {
    settingMidiInputDevice.set(deviceId);
    if (!deviceId) {
      this.service.setDevice('');
      return;
    }
    const err = this.service.setDevice(deviceId);
    if (err) {
      this.opts.onWarning?.(err);
    }
  }

  /** Enumerate available MIDI input devices. */
  listDevices() {
    return this.service.listDevices();
  }

  // ── Step entry controls ───────────────────────────────────────────────────

  /** Arm step entry and request MIDI access if needed. */
  async armStepEntry(): Promise<void> {
    if (!settingMidiInputEnabled.get()) {
      this.opts.onWarning?.('Enable MIDI input in Settings → Editor → MIDI Step Entry first.');
      return;
    }
    if (!this._accessRequested) {
      await this.requestMidiAccess();
    }
    this.service.arm();
    this.opts.onArmedChanged?.(true);
    log.info('MIDI step entry armed');
  }

  /** Disarm step entry. */
  disarmStepEntry(): void {
    this.service.disarm();
    this._noAdvanceStart = null;
    this.opts.onArmedChanged?.(false);
    log.info('MIDI step entry disarmed');
  }

  /** Toggle step entry. Returns new armed state. */
  async toggleStepEntry(): Promise<boolean> {
    if (this.service.isArmed()) {
      this.disarmStepEntry();
      return false;
    } else {
      await this.armStepEntry();
      return this.service.isArmed();
    }
  }

  isArmed(): boolean {
    return this.service.isArmed();
  }

  // ── Settings forwarding ───────────────────────────────────────────────────

  setStepLength(v: StepLength): void {
    settingMidiStepLength.set(v);
    this.service.setStepLength(v);
  }

  setEmitDuration(v: boolean): void {
    settingMidiEmitDurations.set(v);
    this.service.setEmitDuration(v);
  }

  setEntryMode(v: EntryMode): void {
    settingMidiEntryMode.set(v);
    this.service.setEntryMode(v);
  }

  setAutoAdvance(v: boolean): void {
    settingMidiAutoAdvance.set(v);
    this.service.setAutoAdvance(v);
    if (v) this._noAdvanceStart = null; // clear replace-in-place tracking when re-enabling advance
  }

  setAuditionNotes(v: boolean): void {
    settingMidiAuditionNotes.set(v);
    this.service.setAuditionNotes(v);
  }

  setUseNoteDuration(v: boolean): void {
    settingMidiUseNoteDuration.set(v);
    this.service.setUseNoteDuration(v);
  }

  /** Clean up MIDI connection. */
  dispose(): void {
    this.service.dispose();
  }

  // ── Editor integration ────────────────────────────────────────────────────

  private _insertNoteInEditor(
    noteName: string,
    stepLength: StepLength,
    emitDuration: boolean,
  ): void {
    const editor = this.opts.getEditor();
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    const pos = editor.getPosition();
    if (!pos) return;

    const lineText = model.getLineContent(pos.lineNumber);
    const entryMode = this.service.getEntryMode();
    const autoAdvance = this.service.isAutoAdvance();

    // Gate: only allow entry inside a pat body
    if (!isCursorInsidePatBody(lineText, pos.column)) {
      this.opts.onWarning?.('MIDI step entry: cursor must be inside a pat body (after the = on a pat line).');
      return;
    }

    const token = formatNoteToken(noteName, stepLength, emitDuration);

    if (entryMode === 'overwrite-selection') {
      this._replaceSelectionOrInsert(editor, model, pos, token, autoAdvance);
    } else {
      this._insertAtCursor(editor, model, pos, token, autoAdvance);
    }
  }

  private _insertAtCursor(
    editor: monaco.editor.IStandaloneCodeEditor,
    _model: monaco.editor.ITextModel,
    pos: monaco.IPosition,
    token: string,
    autoAdvance: boolean,
  ): void {
    // Always insert at the cursor position — never replace any existing selection.
    // Using a collapsed range ensures Monaco's selection does not get overwritten.
    const insertRange = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
    let editRange: monaco.IRange = insertRange;
    let insertText: string;

    if (!autoAdvance && this._noAdvanceStart) {
      // Replace-in-place: overwrite the token inserted by the previous note press.
      // The cursor sits at the end of that token, so the range is from the saved
      // start column to the current cursor column.
      const { lineNumber: savedLine, startColumn } = this._noAdvanceStart;
      if (savedLine === pos.lineNumber) {
        editRange = new monaco.Range(savedLine, startColumn, pos.lineNumber, pos.column);
      } else {
        // Cursor moved to a different line — discard saved position and start fresh.
        this._noAdvanceStart = null;
      }
    }

    if (autoAdvance) {
      // Append a space so the cursor lands after the token (ready for the next note).
      insertText = `${token} `;
      this._noAdvanceStart = null;
    } else {
      // No trailing space — record where the token starts so a follow-up press
      // can replace it in-place.
      insertText = token;
      this._noAdvanceStart = { lineNumber: pos.lineNumber, startColumn: editRange.startColumn };
    }

    editor.executeEdits('midi-step-entry', [{
      range: editRange,
      text: insertText,
      forceMoveMarkers: true,
    }]);

    editor.focus();
  }

  private _replaceSelectionOrInsert(
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
    pos: monaco.IPosition,
    token: string,
    autoAdvance: boolean,
  ): void {
    const sel = editor.getSelection();
    if (!sel || (sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn)) {
      // No selection — fall back to insert at cursor
      this._insertAtCursor(editor, model, pos, token, autoAdvance);
      return;
    }

    const selectedText = model.getValueInRange(sel);
    const spans = extractNoteTokenSpans(selectedText);

    if (spans.length === 0) {
      // Selection contains no note/rest tokens — warn and abort
      this.opts.onWarning?.('MIDI step entry: selection contains no note or rest tokens to replace.');
      return;
    }

    // Replace the first token span in the selection with the new token.
    // After the replacement, remove the consumed span and leave the rest selected.
    const first = spans[0];
    const before = selectedText.slice(0, first.start);
    const after = selectedText.slice(first.end);
    const newSelectedText = before + token + after;

    editor.executeEdits('midi-step-entry', [{
      range: sel,
      text: newSelectedText,
      forceMoveMarkers: false,
    }]);

    this._noAdvanceStart = null;
    editor.focus();
  }
}
