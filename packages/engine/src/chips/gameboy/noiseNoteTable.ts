/**
 * hUGEDriver-compatible Game Boy noise note-index → NR43 mapping.
 *
 * hUGETracker noise pitch is set by the pattern-row note, not instrument-level
 * divisor/shift. This module ports hUGEDriver's `get_note_poly` so BeatBax
 * preview and UGE export derive the same LFSR clock.
 *
 * Metallic (7-bit) mode: hUGEDriver ORs bit 3 of NR43 from the instrument
 * noise-mode flag — it does not add 72 to the note index before lookup.
 *
 * @see https://github.com/SuperDisk/hUGEDriver/blob/master/hUGEDriver.asm get_note_poly
 */

import { GB_CLOCK } from './periodTables.js';

/** NR43 bits 2–0 → hardware dividing ratio (SameBoy / Pan docs). */
export const NR43_DIVISOR_RATIOS = [8, 16, 32, 48, 64, 80, 96, 112] as const;

/** hUGETracker noise LFSR sample rate from NR43 register byte. */
export const NOISE_LFSR_BASE_HZ = 524288;

export const INVALID_UGE_NOTE_INDEX = -1;

/** Default named-hit note when no uge_note/note is declared (C-5 = index 24). */
export const DEFAULT_NOISE_NOTE_INDEX = 24;

export type GbNoisePreviewMode = 'uge' | 'legacy';

export interface NoiseNoteContext {
  /** BeatBax note on named event, e.g. C7 */
  defaultNote?: string;
  /** Explicit pattern-row note override */
  patternNote?: string;
}

export interface NoisePlaybackParams {
  noteIndex: number;
  nr43: number;
  shift: number;
  divisorCode: number;
  divisorRatio: number;
  lfsrHz: number;
  width: 7 | 15;
}

/**
 * Convert hUGETracker display notation (e.g. "C-7", "C#7") to a UGE note index.
 * Indices 0–72 map to C-3 … C-9.
 */
export function hugeTrackerNoteToIndex(noteName: string): number {
  const normalized = String(noteName ?? '').trim().toUpperCase();
  const match = normalized.match(/^([A-G](?:#|-))([3-9])$/);
  if (!match) return INVALID_UGE_NOTE_INDEX;

  const noteNames = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
  const noteIndex = noteNames.indexOf(match[1]);
  if (noteIndex === -1) return INVALID_UGE_NOTE_INDEX;

  const octave = parseInt(match[2], 10);
  const ugeIndex = (octave - 3) * 12 + noteIndex;
  if (ugeIndex < 0 || ugeIndex > 72) return INVALID_UGE_NOTE_INDEX;
  return ugeIndex;
}

/**
 * Convert BeatBax note notation (e.g. "C6", "D#7") to hUGETracker note index.
 */
export function beatbaxNoteToUgeIndex(noteName: string): number {
  const match = noteName.match(/^([A-G](?:#|b)?)(-?\d+)$/i);
  if (!match) return INVALID_UGE_NOTE_INDEX;

  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const flatToSharp: Record<string, string> = {
    DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#',
  };
  const pitchName = match[1].toUpperCase();
  const normalizedPitch = flatToSharp[pitchName] ?? pitchName;
  const noteIndex = noteNames.indexOf(normalizedPitch);
  if (noteIndex === -1) return INVALID_UGE_NOTE_INDEX;

  const octave = parseInt(match[2], 10);
  const midiNote = (octave + 1) * 12 + noteIndex;
  let ugeIndex = midiNote - 36;

  while (ugeIndex < 0 && ugeIndex + 12 <= 72) {
    ugeIndex += 12;
  }
  if (ugeIndex < 0 || ugeIndex > 72) return INVALID_UGE_NOTE_INDEX;
  return ugeIndex;
}

/**
 * Port of hUGEDriver `get_note_poly`: note index → NR43 polynomial byte (before width OR).
 */
export function ugeNoteIndexToNr43Poly(noteIndex: number): number {
  const clamped = Math.max(0, Math.min(127, Math.floor(noteIndex)));
  let a = ((255 - (clamped + 192)) & 0xff);

  if (a < 7) return a;

  const h = a;
  const b = ((a >> 2) - 1) & 0xff;
  const c = (h & 3) + 4;
  return ((b << 4) | c) & 0xff;
}

export function nr43ToLfsrHz(nr43: number): number {
  const shift = (nr43 >> 4) & 0x0f;
  const divisorCode = nr43 & 0x07;
  const divisorRatio = NR43_DIVISOR_RATIOS[divisorCode] ?? 8;
  return NOISE_LFSR_BASE_HZ / divisorRatio / Math.pow(2, shift + 1);
}

export function parseNoiseWidth(inst: Record<string, unknown>): 7 | 15 {
  const raw = inst['gb:width'] ?? inst.width;
  const n = raw !== undefined ? Number(raw) : 15;
  return n === 7 ? 7 : 15;
}

function readUgeNoteFromInst(inst: Record<string, unknown>): string | undefined {
  const src = inst['gb:uge_note'] ?? inst.uge_note;
  return src !== undefined ? String(src) : undefined;
}

/**
 * Resolve the UGE note index used for NR43 lookup from instrument + optional event context.
 */
export function resolveNoiseNoteIndex(
  inst: Record<string, unknown>,
  noteContext?: NoiseNoteContext,
): number {
  const ugeNote = readUgeNoteFromInst(inst);
  if (ugeNote) {
    const idx = hugeTrackerNoteToIndex(ugeNote);
    if (idx !== INVALID_UGE_NOTE_INDEX) return idx;
  }

  const beatbaxNote = noteContext?.patternNote
    ?? noteContext?.defaultNote
    ?? (inst.note !== undefined ? String(inst.note) : undefined);
  if (beatbaxNote) {
    const idx = beatbaxNoteToUgeIndex(beatbaxNote);
    if (idx !== INVALID_UGE_NOTE_INDEX) return idx;
  }

  return DEFAULT_NOISE_NOTE_INDEX;
}

/**
 * Derive full noise playback parameters from instrument + note context.
 * When previewMode is `legacy`, uses the pre-parity fixed defaults (divisor=3, shift=4).
 */
export function resolveNoisePlayback(
  inst: Record<string, unknown>,
  noteContext?: NoiseNoteContext,
  previewMode: GbNoisePreviewMode = 'uge',
): NoisePlaybackParams {
  const width = parseNoiseWidth(inst);

  if (previewMode === 'legacy') {
    const shift = 4;
    const divisorCode = 3;
    const divisorRatio = 3;
    const lfsrHz = GB_CLOCK / (divisorRatio * Math.pow(2, shift + 1));
    return {
      noteIndex: resolveNoiseNoteIndex(inst, noteContext),
      nr43: (shift << 4) | (divisorCode & 0x07),
      shift,
      divisorCode,
      divisorRatio,
      lfsrHz,
      width,
    };
  }

  const noteIndex = resolveNoiseNoteIndex(inst, noteContext);
  const poly = ugeNoteIndexToNr43Poly(noteIndex);
  const widthBit = width === 7 ? 0x08 : 0x00;
  const nr43 = (poly | widthBit) & 0xff;
  const shift = (nr43 >> 4) & 0x0f;
  const divisorCode = nr43 & 0x07;
  const divisorRatio = NR43_DIVISOR_RATIOS[divisorCode] ?? 8;
  const lfsrHz = nr43ToLfsrHz(nr43);

  return {
    noteIndex,
    nr43,
    shift,
    divisorCode,
    divisorRatio,
    lfsrHz,
    width,
  };
}
