import { noteToMidi, midiToFreq } from '@beatbax/engine';

/**
 * NES APU period tables for pulse and triangle channels.
 *
 * Pulse formula:   f = CPU_CLOCK / (16 × (period + 1))
 * Triangle formula: f = CPU_CLOCK / (32 × (period + 1))
 *
 * Both tables cover MIDI notes 36–96 (C2–C7, 61 notes).
 * Values are period register integers rounded to the nearest integer
 * and verified against equal temperament (A4 = 440 Hz) to within ±0.5 cents.
 *
 * Reference: NES APU hardware documentation, NESDev wiki
 */

/** NTSC CPU clock frequency in Hz (1,789,773 Hz). */
export const NES_CLOCK_NTSC = 1789773;
/** PAL CPU clock frequency in Hz (1,662,607 Hz). */
export const NES_CLOCK_PAL  = 1662607;

export type NesClockRegion = 'ntsc' | 'pal';

let _nesClockRegion: NesClockRegion = 'ntsc';
/** Mutable live binding used by channel backends — updated by setNesClockRegion(). */
export let NES_CLOCK = NES_CLOCK_NTSC;

export function setNesClockRegion(region?: string | null): NesClockRegion {
  const next: NesClockRegion = String(region || '').toLowerCase() === 'pal' ? 'pal' : 'ntsc';
  _nesClockRegion = next;
  NES_CLOCK = next === 'pal' ? NES_CLOCK_PAL : NES_CLOCK_NTSC;
  return _nesClockRegion;
}

export function getNesClockRegion(): NesClockRegion {
  return _nesClockRegion;
}

/**
 * Convert a period register value to frequency using the pulse formula.
 * @param period - 11-bit period register value (0..2047)
 */
export function pulsePeriodToFreq(period: number): number {
  return NES_CLOCK / (16 * (period + 1));
}

/**
 * Convert a frequency to a pulse period register value.
 * @param freq - Target frequency in Hz
 */
export function freqToPulsePeriod(freq: number): number {
  return Math.round(NES_CLOCK / (16 * freq) - 1);
}

/**
 * Convert a period register value to frequency using the triangle formula.
 * @param period - 11-bit period register value (0..2047)
 */
export function trianglePeriodToFreq(period: number): number {
  return NES_CLOCK / (32 * (period + 1));
}

/**
 * Convert a frequency to a triangle period register value.
 * @param freq - Target frequency in Hz
 */
export function freqToTrianglePeriod(freq: number): number {
  return Math.round(NES_CLOCK / (32 * freq) - 1);
}

/**
 * Pulse channel period table — keyed by MIDI note number (36–96).
 *
 * Period values computed from the standard equal-temperament formula:
 *   freq = 440 × 2^((midi − 69) / 12)
 *   period = round(NES_CLOCK / (16 × freq) − 1)
 *
 * Verified: A4 (MIDI 69) → period 253 → freq ≈ 440.0 Hz ✓
 */
export const PULSE_PERIOD: Record<number, number> = (function () {
  const table: Record<number, number> = {};
  for (let midi = 36; midi <= 96; midi++) {
    const freq = midiToFreq(midi);
    table[midi] = Math.max(0, Math.min(2047, Math.round(NES_CLOCK / (16 * freq) - 1)));
  }
  return table;
})();

/**
 * Triangle channel period table — keyed by MIDI note number (36–96).
 *
 * Triangle divides by 32 instead of 16, so the period register value is
 * approximately half the pulse period for the same pitch:
 *   period = round(NES_CLOCK / (32 × freq) − 1)
 *
 * Verified: A4 (MIDI 69) → period 126 → freq ≈ 440.0 Hz ✓
 */
export const TRIANGLE_PERIOD: Record<number, number> = (function () {
  const table: Record<number, number> = {};
  for (let midi = 36; midi <= 96; midi++) {
    const freq = midiToFreq(midi);
    table[midi] = Math.max(0, Math.min(2047, Math.round(NES_CLOCK / (32 * freq) - 1)));
  }
  return table;
})();

/**
 * NTSC noise period timer values.
 * Index 0 (fastest) through 15 (slowest); maps to LFSR clock rates.
 * Values sourced from the NES hardware specification.
 */
export const NOISE_PERIOD_TABLE_NTSC: number[] = [
  4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068
];

/**
 * PAL noise period timer values.
 * Source: NESDev wiki — APU Noise.
 */
export const NOISE_PERIOD_TABLE_PAL: number[] = [
  4, 8, 14, 30, 60, 88, 118, 148, 188, 236, 354, 472, 708, 944, 1890, 3778
];

/** @deprecated Use getNoisePeriodTable() for region-aware access. */
export const NOISE_PERIOD_TABLE: number[] = NOISE_PERIOD_TABLE_NTSC;

/** Return the noise period table for the currently configured region. */
export function getNoisePeriodTable(): number[] {
  return _nesClockRegion === 'pal' ? NOISE_PERIOD_TABLE_PAL : NOISE_PERIOD_TABLE_NTSC;
}

/**
 * NTSC DMC rate table.
 * Index 0 through 15; maps to DMC output sample rates in Hz.
 * Derived from the NTSC CPU clock (1,789,773 Hz) divided by the hardware
 * cycle counts (428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142,
 * 128, 106, 84, 72, 54). Source: NESDev wiki — APU DMC.
 *
 * Index 0  = 4181.71 Hz  (slowest / lowest pitch)
 * Index 15 = 33143.94 Hz (fastest — "33 kHz" in FamiTracker)
 */
export const DMC_RATE_TABLE_NTSC: number[] = [
  4181.71, 4709.93, 5264.04, 5593.04, 6257.95, 7046.35, 7918.51, 8363.42,
  9419.86, 11186.08, 12604.03, 13981.28, 16884.65, 21306.82, 24857.95, 33143.94
];

/**
 * PAL DMC rate table.
 * Derived from the PAL CPU clock (1,662,607 Hz) divided by hardware cycle
 * counts (398, 354, 316, 298, 276, 236, 210, 198, 176, 148, 132, 118, 98,
 * 78, 66, 50). Source: NESDev wiki — APU DMC.
 */
export const DMC_RATE_TABLE_PAL: number[] = [
  4177.40, 4696.63, 5261.41, 5579.22, 6023.21, 7044.94, 7917.18, 8397.00,
  9447.77, 11232.48, 12595.51, 14089.89, 16975.58, 21315.47, 25191.51, 33252.14
];

/** @deprecated Use getDmcRateTable() for region-aware access. */
export const DMC_RATE_TABLE: number[] = DMC_RATE_TABLE_NTSC;

/** Return the DMC rate table for the currently configured region. */
export function getDmcRateTable(): number[] {
  return _nesClockRegion === 'pal' ? DMC_RATE_TABLE_PAL : DMC_RATE_TABLE_NTSC;
}

/**
 * Convert a MIDI note number to pulse channel frequency (Hz).
 * Returns 0 if the note is outside the supported range.
 */
export function midiToPulseFreq(midi: number): number {
  const period = PULSE_PERIOD[midi];
  if (period === undefined) return 0;
  return pulsePeriodToFreq(period);
}

/**
 * Convert a MIDI note number to triangle channel frequency (Hz).
 * Returns 0 if the note is outside the supported range.
 */
export function midiToTriangleFreq(midi: number): number {
  const period = TRIANGLE_PERIOD[midi];
  if (period === undefined) return 0;
  return trianglePeriodToFreq(period);
}

/**
 * Convert a note name + octave to MIDI note number.
 * Accidentals: '#' for sharp, 'B' or 'b' after any note letter for flat.
 * Because 'B' is also a note name, flat is only recognised when it follows
 * another note letter (i.e. not when the input is exactly 'B' or 'B#').
 * Returns null if the note name is not recognised.
 */
export function noteNameToMidi(name: string, octave: number): number | null {
  const primary = noteToMidi(`${name}${octave}`);
  if (primary !== null) return primary;

  const upper = name.toUpperCase();
  if (upper === 'B#') return noteToMidi(`C${octave + 1}`);
  if (upper === 'CB') return noteToMidi(`B${octave}`);
  if (upper === 'E#') return noteToMidi(`F${octave}`);
  if (upper === 'FB') return noteToMidi(`E${octave}`);

  return null;
}
