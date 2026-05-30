/**
 * MIDI Step Entry subsystem for the BeatBax web UI.
 *
 * Responsibilities:
 *  - Request Web MIDI access from the browser
 *  - Enumerate available MIDI input devices
 *  - Subscribe to the selected device's messages
 *  - Filter note-on / note-off MIDI events
 *  - Convert MIDI note numbers to BeatBax note names (sharp-only: C#4, not Db4)
 *  - Expose step-entry lifecycle: arm, disarm, setDevice, setStepLength, etc.
 *  - Forward entered notes to the editor integration layer via callbacks
 *  - Optionally forward audition events for instrument preview
 *
 * Design:
 *  - This module is browser-only (Web MIDI API). It must not be imported in
 *    CLI or Node.js contexts.
 *  - No direct Monaco or DOM manipulation — editor integration is done via
 *    callbacks so this service stays testable.
 *  - Sharp-only note spelling: generates C#4, not Db4.
 */

// ─── Minimal logger ───────────────────────────────────────────────────────────
// Use a minimal wrapper instead of @beatbax/engine/util/logger so this module
// can be imported and unit-tested without a built engine package.
const log = {
  info:  (...args: unknown[]) => console.info('[midi-step-entry]', ...args),
  warn:  (...args: unknown[]) => console.warn('[midi-step-entry]', ...args),
  debug: (...args: unknown[]) => console.debug('[midi-step-entry]', ...args),
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** BeatBax note name spellings, in sharp-only form, indexed 0–11. */
const NOTE_NAMES: readonly string[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

/** MIDI status byte masks */
const MIDI_NOTE_ON  = 0x90;
const MIDI_NOTE_OFF = 0x80;
const MIDI_CHANNEL_MASK = 0x0f;
const MIDI_TYPE_MASK    = 0xf0;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Duration to emit with each inserted note. 'inherit' = no explicit duration suffix. */
export type StepLength = 'inherit' | '1' | '2' | '4' | '8' | '16';

/** How to handle the current editor selection when MIDI notes arrive. */
export type EntryMode = 'insert' | 'overwrite-selection';
/** Scale-awareness behavior for incoming MIDI notes. */
export type ScaleSnapMode = 'off' | 'snap' | 'filter';

export type ScaleLock = 'scale' | 'root+fifth' | 'chord' | 'chord7' | 'octaves';

export interface ScaleConfig {
  root: string;
  mode: string;
}

/** Information about a detected MIDI input device. */
export interface MidiDeviceInfo {
  id: string;
  name: string;
}

// ─── Minimal Web MIDI API type declarations ────────────────────────────────
// The Web MIDI API is not universally available in all TS lib configurations,
// so we declare minimal inline types to avoid requiring @types/webmidi.

interface MidiMessageEvent {
  data: Uint8Array;
}

interface MidiInput extends EventTarget {
  id: string;
  name?: string;
}

interface MidiInputMap {
  size: number;
  get(id: string): MidiInput | undefined;
  forEach(callback: (input: MidiInput) => void): void;
}

interface MidiAccess {
  inputs: MidiInputMap;
}

export interface MidiStepEntryCallbacks {
  /** Called when a note should be inserted/replaced in the editor. */
  onNoteEntered: (noteName: string, stepLength: StepLength, emitDuration: boolean) => void;
  /** Called when a MIDI note-on occurs (for audition). Optional. */
  onAuditionStart?: (noteName: string) => void;
  /** Called when a MIDI note-off occurs (for audition). Optional. */
  onAuditionStop?: (noteName: string) => void;
  /** Called for non-fatal diagnostic messages. Optional. */
  onWarning?: (message: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map a held-duration in milliseconds to the nearest BeatBax step length.
 * Used when useNoteDuration is enabled: the time the key is held determines
 * the step value that is emitted (max :16, minimum :2).
 *
 * Note: '1' is never returned because formatNoteToken suppresses the duration
 * suffix when stepLength is '1', which would break the hold-duration "always
 * emits" contract. Very short taps (< 200 ms) round up to '2'.
 */
export function durationMsToStepLength(durationMs: number): StepLength {
  if (durationMs < 400)  return '2';
  if (durationMs < 800)  return '4';
  if (durationMs < 1600) return '8';
  return '16';
}

// ─── Pure helpers (exported for unit tests) ──────────────────────────────────

/**
 * Convert a MIDI note number (0–127) to a BeatBax note name.
 *
 * Uses sharp-only spelling per the BeatBax note spelling policy.
 * MIDI note 60 = C4 (middle C).
 *
 * @param midiNote  MIDI note number (0–127)
 * @returns BeatBax note string, e.g. 'C4', 'C#4', 'F#5'
 */
export function midiNoteToName(midiNote: number): string {
  const octave    = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

export function noteNameToMidi(noteName: string): number | null {
  const m = String(noteName ?? '').match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const accidental = m[2] ?? '';
  const octave = Number(m[3]);
  if (!Number.isFinite(octave)) return null;
  const normalized = ROOT_ALIASES[`${letter}${accidental}`] ?? `${letter}${accidental}`;
  const pitchClass = NOTE_NAMES.indexOf(normalized);
  if (pitchClass < 0) return null;
  return (octave + 1) * 12 + pitchClass;
}

/**
 * Format a BeatBax note token including an optional duration suffix.
 *
 * @param noteName     BeatBax note name, e.g. 'C4'
 * @param stepLength   Step length setting; 'inherit' omits the duration suffix
 * @param emitDuration When false, never emit a duration suffix regardless of stepLength
 * @returns Formatted note token, e.g. 'C4', 'C4:4', 'C#5:8'
 */
export function formatNoteToken(
  noteName: string,
  stepLength: StepLength,
  emitDuration: boolean,
): string {
  if (!emitDuration || stepLength === 'inherit' || stepLength === '1') return noteName;
  return `${noteName}:${stepLength}`;
}

/**
 * Check whether the given editor cursor position is inside the body of a
 * `pat` definition.
 *
 * Rules:
 *  - The current line must match `^\s*pat\s+\S+\s*=` (it is a pat line)
 *  - The cursor column must be AFTER the `=` character in that line
 *
 * @param lineText  Full text of the cursor's current line
 * @param column    1-based Monaco column number
 * @returns true when the cursor is inside a pat body
 */
export function isCursorInsidePatBody(lineText: string, column: number): boolean {
  const patMatch = lineText.match(/^(\s*pat\s+\S+\s*=)/);
  if (!patMatch) return false;
  // column is 1-based; patMatch[1].length is 0-based end of the "=" character
  return column > patMatch[1].length;
}

/**
 * Extract all note/rest token spans from a selection text.
 *
 * Returns an array of {start, end, value} objects (0-based indices into the
 * selection text string). Only recognises BeatBax note tokens (e.g. C4, C#4,
 * F#5:8) and rest tokens (`.`).
 *
 * Used by replace-selection mode to locate replaceable tokens.
 */
export interface TokenSpan {
  start: number;
  end: number;
  value: string;
}

export function extractNoteTokenSpans(text: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  // Note token: letter A-G (any case), optional # or b, optional -, digit 0-9,
  // optional duration suffix ":N". Handles C-1 (MIDI octave -1) through G9.
  const re = /\b([A-Ga-g][#b]?-?[0-9](?::\d+)?)\b|\./g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, value: m[0] });
  }
  return spans;
}

const SCALE_MODE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const LOCK_DEGREES: Record<ScaleLock, number[] | 'root-only'> = {
  scale: [1, 2, 3, 4, 5, 6, 7],
  'root+fifth': [1, 5],
  chord: [1, 3, 5],
  chord7: [1, 3, 5, 7],
  octaves: 'root-only',
};

const ROOT_ALIASES: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Fb: 'E',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
  Cb: 'B',
};

function rootToPitchClass(root: string): number | null {
  const raw = String(root ?? '').trim();
  const canonical = ROOT_ALIASES[raw] ?? raw;
  const idx = NOTE_NAMES.indexOf(canonical);
  return idx >= 0 ? idx : null;
}

export function normalizeScaleConfig(rawScale: any): ScaleConfig | null {
  const root = String(rawScale?.root ?? '').trim();
  const mode = String(rawScale?.mode ?? '').trim().toLowerCase();
  const normalizedRoot = ROOT_ALIASES[root] ?? root;
  if (rootToPitchClass(normalizedRoot) === null) return null;
  if (!SCALE_MODE_INTERVALS[mode]) return null;
  return { root: normalizedRoot, mode };
}

export function buildScalePitchClasses(root: string, mode: string): Set<number> | null {
  const rootPc = rootToPitchClass(root);
  const intervals = SCALE_MODE_INTERVALS[String(mode ?? '').toLowerCase()];
  if (rootPc === null || !intervals) return null;
  return new Set(intervals.map((i) => (rootPc + i) % 12));
}

export function scaleLockPitchClasses(root: string, mode: string, lock: ScaleLock | undefined): Set<number> | null {
  const scalePitchClasses = buildScalePitchClasses(root, mode);
  if (!scalePitchClasses) return null;
  if (!lock || lock === 'scale') return scalePitchClasses;
  const rootPc = rootToPitchClass(root);
  if (rootPc === null) return null;
  if (lock === 'octaves') return new Set([rootPc]);
  const intervals = SCALE_MODE_INTERVALS[String(mode ?? '').toLowerCase()] ?? [];
  const degrees = LOCK_DEGREES[lock];
  if (!Array.isArray(degrees)) return scalePitchClasses;
  const out = new Set<number>();
  for (const degree of degrees) {
    const i = intervals[degree - 1];
    if (i !== undefined) out.add((rootPc + i) % 12);
  }
  return out.size > 0 ? out : scalePitchClasses;
}

/**
 * Snap a MIDI pitch to the nearest allowed pitch class.
 * If two candidates are equally distant (tritone tie), upward movement wins.
 */
export function snapMidiToPitchClasses(midiPitch: number, allowedPitchClasses: Set<number>): number {
  const pitchClass = ((midiPitch % 12) + 12) % 12;
  if (allowedPitchClasses.has(pitchClass)) return midiPitch;
  for (let delta = 1; delta <= 6; delta++) {
    if (allowedPitchClasses.has((pitchClass + delta) % 12)) return midiPitch + delta;
    if (allowedPitchClasses.has((pitchClass - delta + 12) % 12)) return midiPitch - delta;
  }
  return midiPitch;
}

// ─── MidiStepEntryService ────────────────────────────────────────────────────

/**
 * Manages the browser MIDI input session and step-entry state.
 *
 * Lifecycle:
 *  1. `requestAccess()` — prompt the browser for MIDI permission (async)
 *  2. `listDevices()` — enumerate available MIDI inputs
 *  3. `setDevice(id)` — select an input device
 *  4. `arm()` — begin step entry; MIDI note-on events call `callbacks.onNoteEntered`
 *  5. `disarm()` — pause step entry (does not disconnect the device)
 *  6. `dispose()` — close the MIDI connection and release resources
 */
export class MidiStepEntryService {
  private midiAccess: MidiAccess | null = null;
  private selectedInput: MidiInput | null = null;
  private armed = false;
  private _deviceId: string = '';

  // Step-entry settings
  private stepLength: StepLength = 'inherit';
  private emitDuration = false;
  private entryMode: EntryMode = 'insert';
  private autoAdvance = true;
  private auditionNotes = false;
  private useNoteDuration = false;

  // Note-on timestamps for hold-duration mode (midiNote → timestamp ms)
  private _noteOnTimes: Map<number, number> = new Map();

  // Stored message handler so we can remove it cleanly
  private _msgHandler: ((e: MidiMessageEvent) => void) | null = null;

  constructor(private callbacks: MidiStepEntryCallbacks) {}

  // ── Configuration ──────────────────────────────────────────────────────────

  setStepLength(v: StepLength): void { this.stepLength = v; }
  setEmitDuration(v: boolean): void { this.emitDuration = v; }
  setEntryMode(v: EntryMode): void { this.entryMode = v; }
  setAutoAdvance(v: boolean): void { this.autoAdvance = v; }
  setAuditionNotes(v: boolean): void { this.auditionNotes = v; }
  setUseNoteDuration(v: boolean): void { this.useNoteDuration = v; }

  getStepLength(): StepLength { return this.stepLength; }
  getEntryMode(): EntryMode { return this.entryMode; }
  isAutoAdvance(): boolean { return this.autoAdvance; }
  isAuditionNotes(): boolean { return this.auditionNotes; }
  isUseNoteDuration(): boolean { return this.useNoteDuration; }
  isArmed(): boolean { return this.armed; }
  getDeviceId(): string { return this._deviceId; }

  // ── MIDI access ────────────────────────────────────────────────────────────

  /** Whether the browser's Web MIDI API is available. */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  /**
   * Request MIDI access from the browser.
   *
   * Returns a diagnostic string on failure (permission denied, not supported,
   * etc.) or null on success. The caller should surface any returned string
   * as a visible warning.
   */
  async requestAccess(): Promise<string | null> {
    if (!MidiStepEntryService.isSupported()) {
      return 'Web MIDI is not supported in this browser. Try Chrome or Edge.';
    }
    try {
      this.midiAccess = await (navigator as any).requestMIDIAccess({ sysex: false });
      log.info('MIDI access granted. Inputs:', this.midiAccess!.inputs.size);
      return null;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      log.warn('MIDI access denied:', msg);
      return `MIDI permission denied: ${msg}`;
    }
  }

  /** List all currently-available MIDI input devices. */
  listDevices(): MidiDeviceInfo[] {
    if (!this.midiAccess) return [];
    const devices: MidiDeviceInfo[] = [];
    this.midiAccess.inputs.forEach((input) => {
      devices.push({ id: input.id, name: input.name ?? input.id });
    });
    return devices;
  }

  /**
   * Select a MIDI input device by ID and attach the message listener.
   * Pass an empty string to clear the selection.
   *
   * Returns a diagnostic string if the device is not found, or null on success.
   */
  setDevice(deviceId: string): string | null {
    // Detach from the previous input (clears _deviceId and _noteOnTimes)
    this._detachInput();

    if (!deviceId) {
      return null;
    }

    if (!this.midiAccess) {
      return 'MIDI access has not been granted yet.';
    }

    const input = this.midiAccess.inputs.get(deviceId);
    if (!input) {
      return `MIDI device "${deviceId}" not found. It may have been disconnected.`;
    }

    this.selectedInput = input;
    this._deviceId = deviceId;
    this._attachInput();
    log.info('MIDI device selected:', input.name);
    return null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Arm step entry — incoming note-on events will call onNoteEntered. */
  arm(): void {
    if (!this.selectedInput) {
      this.callbacks.onWarning?.('Select a MIDI input device before arming MIDI step entry.');
      this.armed = false;
      return;
    }
    this.armed = true;
    log.info('MIDI step entry armed');
  }

  /** Disarm step entry — note events are ignored but the device stays connected. */
  disarm(): void {
    this.armed = false;
    log.info('MIDI step entry disarmed');
  }

  /** Toggle between armed and disarmed. Returns the new armed state. */
  toggle(): boolean {
    if (this.armed) {
      this.disarm();
    } else {
      this.arm();
    }
    return this.armed;
  }

  /** Close the MIDI connection and release all resources. */
  dispose(): void {
    this._detachInput();
    this.midiAccess = null;
    this.armed = false;
    log.info('MIDI step entry disposed');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _attachInput(): void {
    if (!this.selectedInput) return;
    this._msgHandler = (e: MidiMessageEvent) => this._onMessage(e);
    this.selectedInput.addEventListener('midimessage', this._msgHandler as unknown as EventListener);
  }

  private _detachInput(): void {
    if (this.selectedInput && this._msgHandler) {
      this.selectedInput.removeEventListener('midimessage', this._msgHandler as unknown as EventListener);
      this._msgHandler = null;
    }
    this.selectedInput = null;
    this._deviceId = '';
    this._noteOnTimes.clear();
  }

  private _onMessage(e: MidiMessageEvent): void {
    const data = e.data;
    if (!data || data.length < 3) return;

    const statusByte = data[0];
    const type       = statusByte & MIDI_TYPE_MASK;
    const note       = data[1];
    const velocity   = data[2];

    // note-on with velocity 0 is treated as note-off by convention
    if (type === MIDI_NOTE_ON && velocity > 0) {
      this._handleNoteOn(note, velocity);
    } else if (type === MIDI_NOTE_OFF || (type === MIDI_NOTE_ON && velocity === 0)) {
      this._handleNoteOff(note);
    }
  }

  private _handleNoteOn(midiNote: number, _velocity: number): void {
    const noteName = midiNoteToName(midiNote);

    // Record note-on timestamp when using hold-duration for step length
    if (this.useNoteDuration) {
      this._noteOnTimes.set(midiNote, Date.now());
    }

    // Step entry only when armed
    if (!this.armed) return;

    // Audition (play entered notes) only when armed
    if (this.auditionNotes) {
      this.callbacks.onAuditionStart?.(noteName);
    }

    // When useNoteDuration is enabled, defer entry until the key is released
    if (this.useNoteDuration) return;

    const token = formatNoteToken(noteName, this.stepLength, this.emitDuration);
    this.callbacks.onNoteEntered(noteName, this.stepLength, this.emitDuration);
    log.debug('Step entry note:', token);
  }

  private _handleNoteOff(midiNote: number): void {
    const noteName = midiNoteToName(midiNote);

    if (this.armed && this.auditionNotes) {
      this.callbacks.onAuditionStop?.(noteName);
    }

    // When useNoteDuration is enabled, entry happens on note-off using the held duration
    if (!this.armed || !this.useNoteDuration) {
      this._noteOnTimes.delete(midiNote);
      return;
    }

    const startTime = this._noteOnTimes.get(midiNote);
    this._noteOnTimes.delete(midiNote);

    if (startTime === undefined) {
      // No recorded note-on timestamp — the key was held before hold-duration mode
      // was enabled, or the note-on event was missed. Bail out to avoid a spurious
      // insertion with a nonsensical duration.
      log.debug('Step entry (hold-duration): skipping note-off with no matching note-on:', noteName);
      return;
    }

    const durationMs = Date.now() - startTime;
    const computedStep = durationMsToStepLength(durationMs);
    // Always emit the duration when derived from key hold time
    this.callbacks.onNoteEntered(noteName, computedStep, true);
    log.debug('Step entry note (hold-duration):', noteName, computedStep);
  }
}
