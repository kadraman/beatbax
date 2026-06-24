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
  isEffectDefinitionLine,
  isInstrumentDefinitionLine,
  isMidiPreviewLine,
  resolveEffectNameFromLine,
  extractNoteTokenSpans,
  formatNoteToken,
  prefixSpacingBeforeInsert,
  type StepLength,
  type EntryMode,
  type ScaleSnapMode,
  normalizeScaleConfig,
  scaleLockPitchClasses,
  snapMidiToPitchClasses,
  noteNameToMidi,
  midiNoteToName,
} from '@beatbax/app-core/input/midi-step-entry';
import { resolvePrimaryPatternLock } from '@beatbax/app-core/editor/scale-context';
import { ensureAudioCtxReady } from '@beatbax/app-core/editor/codelens-preview';
import {
  settingMidiInputEnabled,
  settingMidiInputDevice,
  settingMidiStepLength,
  settingMidiEmitDurations,
  settingMidiEntryMode,
  settingMidiAutoAdvance,
  settingMidiAuditionNotes,
  settingMidiUseNoteDuration,
  settingMidiScaleSnapMode,
} from '@beatbax/app-core/stores/settings.store';

const log = createLogger('ui:midi-controller');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MidiStepEntryControllerOptions {
  /** Returns the current Monaco editor instance (may be null during setup). */
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null;
  /** Called with a note name to trigger a brief audition playback. */
  onAuditionNote?: (noteName: string) => void;
  /** Called with an effect name to trigger effect preset preview. */
  onPreviewEffect?: (effectName: string) => void;
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
  private scaleSnapMode: ScaleSnapMode = 'off';
  private parsedAst: any = null;
  private _accessRequested = false;
  /** Tracks the start position of the last no-advance insertion for replace-in-place. */
  private _noAdvanceStart: { lineNumber: number; startColumn: number } | null = null;
  /** Tracks overwrite-selection cycling so repeated notes advance and wrap. */
  private _overwriteCycle: {
    blockStartOffset: number;
    blockEndOffset: number;
    activeStartOffset: number;
    activeEndOffset: number;
    nextSpanIndex: number;
  } | null = null;

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
      onIdlePreview: (noteName) => {
        this._handleIdlePreview(noteName);
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
    this.scaleSnapMode = settingMidiScaleSnapMode.get() as ScaleSnapMode;
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
        // Saved device became unavailable (e.g. unplugged between sessions).
        // Clear persisted selection so UI and Record button state stay accurate.
        settingMidiInputDevice.set('');
        this.service.setDevice('');
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
      settingMidiInputDevice.set('');
      this.service.setDevice('');
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
    if (!settingMidiInputDevice.get()) {
      this.opts.onWarning?.('Select a MIDI input device in Settings → Editor → MIDI Step Entry before arming.');
      this.service.disarm();
      this.opts.onArmedChanged?.(false);
      return;
    }
    if (!this._accessRequested) {
      await this.requestMidiAccess();
    }
    this.service.arm();
    const armed = this.service.isArmed();
    this.opts.onArmedChanged?.(armed);
    if (armed) {
      ensureAudioCtxReady();
      log.info('MIDI step entry armed');
    }
  }

  /** Disarm step entry. */
  disarmStepEntry(): void {
    this.service.disarm();
    this._noAdvanceStart = null;
    this._overwriteCycle = null;
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
    this._overwriteCycle = null;
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

  setScaleSnapMode(v: ScaleSnapMode): void {
    settingMidiScaleSnapMode.set(v);
    this.scaleSnapMode = v;
  }

  setParsedAst(ast: any): void {
    this.parsedAst = ast ?? null;
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
      if (isMidiPreviewLine(lineText, pos.column)) {
        this._triggerLinePreview(lineText, pos.column, noteName);
        return;
      }
      this.opts.onWarning?.('MIDI step entry: cursor must be inside a pat body (after the = on a pat line).');
      return;
    }

    const noteForInsert = this._applyScaleAwareness(noteName, lineText);
    if (!noteForInsert) return;
    const token = formatNoteToken(noteForInsert, stepLength, emitDuration);

    if (entryMode === 'overwrite-selection') {
      if (this._replaceSelectionOrInsert(editor, model, pos, token, autoAdvance)) {
        this._maybeAuditionAfterInsert(noteForInsert);
      }
    } else {
      this._insertAtCursor(editor, model, pos, token, autoAdvance);
      this._maybeAuditionAfterInsert(noteForInsert);
    }
  }

  private _maybeAuditionAfterInsert(noteName: string): void {
    if (!this.service.isAuditionNotes()) return;
    this.opts.onAuditionNote?.(noteName);
  }

  private _handleIdlePreview(noteName: string): void {
    if (!settingMidiInputEnabled.get()) return;
    ensureAudioCtxReady();
    const editor = this.opts.getEditor();
    if (!editor) return;
    const model = editor.getModel();
    const pos = editor.getPosition();
    if (!model || !pos) return;
    const lineText = model.getLineContent(pos.lineNumber);
    this._triggerLinePreview(lineText, pos.column, noteName);
  }

  private _triggerLinePreview(lineText: string, column: number, noteName: string): void {
    if (isEffectDefinitionLine(lineText)) {
      const effectName = resolveEffectNameFromLine(lineText);
      if (effectName) this.opts.onPreviewEffect?.(effectName);
      return;
    }
    if (isInstrumentDefinitionLine(lineText) || isCursorInsidePatBody(lineText, column)) {
      this.opts.onAuditionNote?.(noteName);
    }
  }

  private _applyScaleAwareness(noteName: string, lineText: string): string | null {
    if (this.scaleSnapMode === 'off') return noteName;
    const scale = normalizeScaleConfig(this.parsedAst?.scale);
    if (!scale) return noteName;

    const patternMatch = lineText.match(/^\s*pat\s+([^\s=]+)\s*=/);
    const patternName = patternMatch?.[1];
    const lock = patternName ? resolvePrimaryPatternLock(this.parsedAst, patternName) : undefined;
    const allowedPitchClasses = scaleLockPitchClasses(scale.root, scale.mode, lock);
    if (!allowedPitchClasses || allowedPitchClasses.size === 0) return noteName;

    const midi = noteNameToMidi(noteName);
    if (midi === null) return noteName;
    const snapped = snapMidiToPitchClasses(midi, allowedPitchClasses);
    if (this.scaleSnapMode === 'filter' && snapped !== midi) return null;
    if (snapped === midi) return noteName;
    return midiNoteToName(snapped);
  }

  private _insertAtCursor(
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
    pos: monaco.IPosition,
    token: string,
    autoAdvance: boolean,
  ): void {
    this._overwriteCycle = null;

    // Always insert at the cursor position — never replace any existing selection.
    // Using a collapsed range ensures Monaco's selection does not get overwritten.
    const insertRange = new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
    let editRange: monaco.IRange = insertRange;
    let insertText: string;
    const lineText = model.getLineContent(pos.lineNumber);

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

    const isReplaceInPlace =
      editRange.startLineNumber === editRange.endLineNumber &&
      editRange.startColumn !== editRange.endColumn;

    let noteToken = token;
    if (!isReplaceInPlace) {
      noteToken = prefixSpacingBeforeInsert(lineText, editRange.startColumn, token);
    }

    if (autoAdvance) {
      // Append a space so the cursor lands after the token (ready for the next note).
      insertText = `${noteToken} `;
      this._noAdvanceStart = null;
    } else {
      // No trailing space — record where the token starts so a follow-up press
      // can replace it in-place.
      insertText = noteToken;
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
  ): boolean {
    const sel = editor.getSelection();
    if (!sel || (sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn)) {
      this._overwriteCycle = null;
      // No selection — fall back to insert at cursor
      this._insertAtCursor(editor, model, pos, token, autoAdvance);
      return true;
    }

    const continuingCycle = this._resolveOverwriteCycleSelection(editor, model, sel);
    const blockRange = continuingCycle
      ? this._rangeFromOffsets(model, continuingCycle.blockStartOffset, continuingCycle.blockEndOffset)
      : new monaco.Range(sel.startLineNumber, sel.startColumn, sel.endLineNumber, sel.endColumn);
    const selectedText = model.getValueInRange(blockRange);
    const spans = extractNoteTokenSpans(selectedText);

    if (spans.length === 0) {
      this._overwriteCycle = null;
      // Selection contains no note/rest tokens — warn and abort
      this.opts.onWarning?.('MIDI step entry: selection contains no note or rest tokens to replace.');
      return false;
    }

    const targetIndex = continuingCycle ? (continuingCycle.nextSpanIndex % spans.length) : 0;
    const targetSpan = spans[targetIndex];
    const before = selectedText.slice(0, targetSpan.start);
    const after = selectedText.slice(targetSpan.end);
    const newSelectedText = before + token + after;

    editor.executeEdits('midi-step-entry', [{
      range: blockRange,
      text: newSelectedText,
      forceMoveMarkers: false,
    }]);

    const nextSpans = extractNoteTokenSpans(newSelectedText);
    if (nextSpans.length > 0) {
      const blockStartOffset = model.getOffsetAt({
        lineNumber: blockRange.startLineNumber,
        column: blockRange.startColumn,
      });
      const nextSpanIndex = (targetIndex + 1) % nextSpans.length;
      const nextSpan = nextSpans[nextSpanIndex];
      const nextRange = this._rangeFromOffsets(
        model,
        blockStartOffset + nextSpan.start,
        blockStartOffset + nextSpan.end,
      );
      this._overwriteCycle = {
        blockStartOffset,
        blockEndOffset: blockStartOffset + newSelectedText.length,
        activeStartOffset: blockStartOffset + nextSpan.start,
        activeEndOffset: blockStartOffset + nextSpan.end,
        nextSpanIndex,
      };
      editor.setSelection(nextRange);
    } else {
      this._overwriteCycle = null;
    }

    this._noAdvanceStart = null;
    editor.focus();
    return true;
  }

  private _resolveOverwriteCycleSelection(
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
    selection: monaco.Selection,
  ) {
    if (!this._overwriteCycle) return null;

    const activeRange = this._rangeFromOffsets(
      model,
      this._overwriteCycle.activeStartOffset,
      this._overwriteCycle.activeEndOffset,
    );

    const sameSelection =
      selection.startLineNumber === activeRange.startLineNumber &&
      selection.startColumn === activeRange.startColumn &&
      selection.endLineNumber === activeRange.endLineNumber &&
      selection.endColumn === activeRange.endColumn;

    if (!sameSelection) {
      this._overwriteCycle = null;
      return null;
    }

    return this._overwriteCycle;
  }

  private _rangeFromOffsets(
    model: monaco.editor.ITextModel,
    startOffset: number,
    endOffset: number,
  ): monaco.Range {
    const start = model.getPositionAt(startOffset);
    const end = model.getPositionAt(endOffset);
    return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
  }
}
