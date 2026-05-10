/**
 * Centralized pitch and macro utilities for BeatBax.
 */

export const NOTE_SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3,
  E: 4, F: 5, 'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8,
  A: 9, 'A#': 10, BB: 10, B: 11,
};

/**
 * Parse a note name (e.g. "C4", "F#5", "Bb3") to MIDI note number.
 * C4 = 60 (scientific pitch notation).
 */
export function noteToMidi(note: string): number | null {
  const m = note.match(/^([A-G])([#bB]?)(-?\d+)$/i);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2] ? (m[2].toLowerCase() === 'b' ? 'B' : '#') : '';
  const octave = parseInt(m[3], 10);
  const key = letter + acc;
  const semi = NOTE_SEMITONES[key as keyof typeof NOTE_SEMITONES];
  if (semi === undefined) return null;
  return (octave + 1) * 12 + semi;
}

/**
 * Convert MIDI note number to note name (e.g. 60 → "C4").
 */
export function midiToNote(n: number): string {
  const octave = Math.floor(n / 12) - 1;
  const pitch = ((n % 12) + 12) % 12;
  const names: Record<number, string> = {
    0: 'C', 1: 'C#', 2: 'D', 3: 'D#', 4: 'E', 5: 'F',
    6: 'F#', 7: 'G', 8: 'G#', 9: 'A', 10: 'A#', 11: 'B',
  };
  return `${names[pitch]}${octave}`;
}

/**
 * Convert MIDI note number to frequency (Hz) using equal temperament.
 */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface ParsedMacro {
  values: number[];
  loopPoint: number; // -1 = no loop
}

export interface MacroState {
  index: number;
  done: boolean;
}

/**
 * Parse a macro value from an instrument property.
 * Accepts: `"[1,2,3|2]"` (string), `[1,2,3]` (array), `null`/`undefined`
 */
export function parseMacro(raw: unknown): ParsedMacro | null {
  if (raw === undefined || raw === null) return null;

  if (Array.isArray(raw)) {
    const vals = raw.map(Number).filter(Number.isFinite);
    return vals.length > 0 ? { values: vals, loopPoint: -1 } : null;
  }

  let str = String(raw).trim();
  if (!str.startsWith('[')) return null;
  if (str.endsWith(']')) str = str.slice(1, -1);
  else str = str.slice(1);

  let loopPoint = -1;
  const pipeIdx = str.lastIndexOf('|');
  if (pipeIdx >= 0) {
    loopPoint = parseInt(str.slice(pipeIdx + 1), 10);
    if (isNaN(loopPoint) || loopPoint < 0) loopPoint = -1;
    str = str.slice(0, pipeIdx);
  }

  const values = str.split(',').map(s => parseFloat(s.trim())).filter(Number.isFinite);
  if (values.length === 0) return null;
  if (loopPoint >= values.length) loopPoint = values.length - 1;
  return { values, loopPoint };
}

/**
 * Get the current value from a ParsedMacro given its state.
 */
export function macroValue(macro: ParsedMacro, state: MacroState): number {
  if (state.done) return macro.values[macro.values.length - 1];
  return macro.values[Math.min(state.index, macro.values.length - 1)];
}

/**
 * Advance a macro state by one frame.
 */
export function advanceMacro(macro: ParsedMacro, state: MacroState): void {
  if (state.done) return;
  state.index++;
  if (state.index >= macro.values.length) {
    if (macro.loopPoint >= 0) {
      state.index = macro.loopPoint;
    } else {
      state.index = macro.values.length - 1;
      state.done = true;
    }
  }
}

/**
 * Create a new macro state cursor.
 */
export function makeMacroState(): MacroState {
  return { index: 0, done: false };
}
