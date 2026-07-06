/**
 * hUGETracker / hUGEDriver noise note → NR43 clock mapping.
 *
 * Pattern notes on the Game Boy noise channel control the LFSR clock via NR43.
 * hUGEDriver derives NR43 bits 6–4 (shift) and 2–0 (divisor) from the note index
 * using get_note_poly; instrument width sets NR43 bit 3 separately.
 */

/** UGE pattern empty/rest note value. */
export const UGE_EMPTY_NOTE = 90;

/** Default noise clock when no uge_note or explicit divisor/shift is set. */
export const DEFAULT_NOISE_DIVISOR = 3;
export const DEFAULT_NOISE_SHIFT = 4;

export interface NoiseClockParams {
  shift: number;
  divisor: number;
  nr43: number;
}

/**
 * Convert hUGETracker display notation (e.g. "C-7", "C#7") to a UGE note index.
 */
export function hugeTrackerNoteToIndex(noteName: string): number {
  const normalized = String(noteName ?? '').trim().toUpperCase();
  const match = normalized.match(/^([A-G](?:#|-))([3-9])$/);
  if (!match) return UGE_EMPTY_NOTE;

  const noteNames = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
  const noteIndex = noteNames.indexOf(match[1]);
  if (noteIndex === -1) return UGE_EMPTY_NOTE;

  const octave = parseInt(match[2], 10);
  const ugeIndex = (octave - 3) * 12 + noteIndex;
  if (ugeIndex < 0 || ugeIndex > 72) return UGE_EMPTY_NOTE;
  return ugeIndex;
}

/**
 * Port of hUGEDriver get_note_poly — NR43 clock bits before width OR.
 * @param noteIndex UGE note index (0–72)
 */
export function getNotePoly(noteIndex: number): number {
  let a = (((noteIndex + 192) & 0xff) ^ 0xff) & 0xff;
  if (a < 7) return a;

  const h = a;
  const b = ((a >> 2) - 1) & 0xff;
  const c = (h & 3) + 4;
  a = (c | ((b << 4) & 0xf0)) & 0xff;
  return a;
}

/** Extract NR43 shift (bits 6–4) and divisor (bits 2–0). */
export function nr43ToShiftDivisor(nr43: number): { shift: number; divisor: number } {
  return {
    shift: (nr43 >> 4) & 0x7,
    divisor: nr43 & 0x7,
  };
}

/** Apply instrument LFSR width to NR43 (bit 3: 1 = 7-bit, 0 = 15-bit). */
export function applyNoiseWidthToNr43(nr43: number, width: number): number {
  if (width === 7) return nr43 | 0x08;
  return nr43 & ~0x08;
}

export function resolveNoiseWidth(inst: Record<string, unknown> | null | undefined): number {
  if (!inst) return 15;
  const raw = inst.width ?? inst['gb:width'];
  if (raw === undefined || raw === null || raw === '') return 15;
  const n = Number(raw);
  return n === 7 ? 7 : 15;
}

function readOptionalNumber(inst: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = inst[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Clamp NR43 clock field to hardware range (bits 6–4 shift, bits 2–0 divisor code). */
function clampNr43ClockField(n: number): number {
  return Math.max(0, Math.min(7, Math.floor(n)));
}

function noiseClockFromShiftDivisor(
  shift: number,
  divisor: number,
  width: number,
): NoiseClockParams {
  const shiftCode = clampNr43ClockField(shift);
  const divisorCode = clampNr43ClockField(divisor);
  const baseNr43 = (shiftCode << 4) | divisorCode;
  return {
    shift: shiftCode,
    divisor: divisorCode,
    nr43: applyNoiseWidthToNr43(baseNr43, width),
  };
}

/**
 * Resolve noise LFSR clock parameters for playback.
 *
 * Priority:
 * 1. Explicit divisor/shift on the instrument (test/low-level override)
 * 2. uge_note → get_note_poly
 * 3. Defaults (divisor=3, shift=4)
 */
export function resolveNoiseClock(inst: Record<string, unknown> | null | undefined): NoiseClockParams {
  const explicitDivisor = inst ? readOptionalNumber(inst, 'divisor', 'gb:divisor') : undefined;
  const explicitShift = inst ? readOptionalNumber(inst, 'shift', 'gb:shift') : undefined;

  if (explicitDivisor !== undefined || explicitShift !== undefined) {
    const width = resolveNoiseWidth(inst);
    return noiseClockFromShiftDivisor(
      explicitShift ?? DEFAULT_NOISE_SHIFT,
      explicitDivisor ?? DEFAULT_NOISE_DIVISOR,
      width,
    );
  }

  const ugeNote = inst?.uge_note;
  if (typeof ugeNote === 'string' && ugeNote.trim()) {
    const noteIndex = hugeTrackerNoteToIndex(ugeNote);
    if (noteIndex !== UGE_EMPTY_NOTE) {
      const poly = getNotePoly(noteIndex);
      const { shift, divisor } = nr43ToShiftDivisor(poly);
      const width = resolveNoiseWidth(inst);
      return { shift, divisor, nr43: applyNoiseWidthToNr43(poly, width) };
    }
  }

  const width = resolveNoiseWidth(inst);
  return noiseClockFromShiftDivisor(DEFAULT_NOISE_SHIFT, DEFAULT_NOISE_DIVISOR, width);
}

/** Map NR43 divisor code (bits 2–0) to Pan Docs ratio r (524288 Hz base). Code 0 → 0.5. */
export function nr43DivisorCodeToRatio(divisorCode: number): number {
  const code = divisorCode & 7;
  if (code === 0) return 0.5;
  return code * 16;
}

/** LFSR update rate in Hz from NR43 shift/divisor code. */
export function noiseClockToLfsrHz(shift: number, divisorCode: number, gbClock = 4194304): number {
  const r = nr43DivisorCodeToRatio(divisorCode);
  // PCM/WebAudio: gbClock / (r << shift) — matches hUGETracker preview timbre better
  // than the slower Pan Docs 524288/r/2^(shift+1) formula (which is inaudible on
  // typical speakers when combined with hardware-accurate sample-hold).
  return gbClock / (r * Math.pow(2, shift || 0));
}

/** @deprecated Use triggerGameBoyLfsr — kept for imports that expect a constant name. */
export const GB_NOISE_LFSR_INITIAL = 0;

/**
 * Noise PCM/WebAudio output scale tuned against hUGETracker kick reference (~0.23 peak).
 * Applied in pcmRenderer and noise.ts only — does not affect pulse/wave paths.
 */
export const NOISE_OUTPUT_GAIN = 0.25;

/**
 * Hardware NR41 length duration when length is enabled.
 * hUGEDriver writes length & 0x3F to NR41; sound lasts (64 - length) / 256 seconds.
 */
export function resolveNoiseHardwareLengthSec(inst: Record<string, unknown> | null | undefined): number | undefined {
  const raw = inst?.length ?? inst?.['gb:length'];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const lengthVal = Math.max(0, Math.min(63, Math.floor(n)));
  return (64 - lengthVal) / 256;
}

/** Playback duration: at least one pattern tick, extended by hardware length when set. */
export function resolveNoisePlayDurationSec(
  inst: Record<string, unknown> | null | undefined,
  patternTickSec: number,
): number {
  const hwLen = resolveNoiseHardwareLengthSec(inst);
  if (hwLen === undefined) return patternTickSec;
  return Math.max(patternTickSec, hwLen);
}

/**
 * Advance the Game Boy CH4 LFSR one clock (SameBoy-compatible 7/15-bit paths).
 */
export function stepGameBoyLfsr(lfsr: number, width7: boolean): number {
  const highBitMask = width7 ? 0x4040 : 0x4000;
  const newHighBit = ((lfsr ^ (lfsr >> 1)) ^ 1) & 1;
  let next = (lfsr >> 1) & 0x7fff;
  if (newHighBit) next |= highBitMask;
  else next &= ~highBitMask;
  return next;
}

/** LFSR state after channel trigger — SameBoy reset then advance to first bit-0=1 state. */
export function triggerGameBoyLfsr(width7: boolean): number {
  let lfsr = stepGameBoyLfsr(0, width7);
  if (lfsr & 1) return lfsr;
  for (let i = 0; i < 126; i++) {
    lfsr = stepGameBoyLfsr(lfsr, width7);
    if (lfsr & 1) return lfsr;
  }
  return lfsr;
}

/** CH4 PCM output: bipolar LFSR bit (matches hUGETracker WAV export, audible on speakers). */
export function gameBoyNoiseSample(lfsr: number): number {
  return (lfsr & 1) ? 1 : -1;
}
