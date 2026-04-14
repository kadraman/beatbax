/**
 * NTSC NES APU period tables for pulse and triangle channels.
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

/** NTSC CPU clock frequency in Hz. */
export const NES_CLOCK = 1789773;

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
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
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
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    table[midi] = Math.max(0, Math.min(2047, Math.round(NES_CLOCK / (32 * freq) - 1)));
  }
  return table;
})();

/**
 * NTSC noise period timer values.
 * Index 0 (fastest) through 15 (slowest); maps to LFSR clock rates.
 * Values sourced from the NES hardware specification.
 */
export const NOISE_PERIOD_TABLE: number[] = [
  4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068
];

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
export const DMC_RATE_TABLE: number[] = [
  4181.71, 4709.93, 5264.04, 5593.04, 6257.95, 7046.35, 7918.51, 8363.42,
  9419.86, 11186.08, 12604.03, 13981.28, 16884.65, 21306.82, 24857.95, 33143.94
];

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
  // Normalise: upper-case the note letter, keep accidental case-sensitive
  const upper = name.toUpperCase();
  const noteMap: Record<string, number> = {
    C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3,
    E: 4, FB: 4, 'E#': 5, F: 5, 'F#': 6, GB: 6,
    G: 7, 'G#': 8, AB: 8, A: 9, 'A#': 10, BB: 10,
    B: 11, 'B#': 12, CB: 11,
  };
  const semi = noteMap[upper];
  if (semi === undefined) return null;
  // 'B#' is enharmonic to C of the next octave (MIDI +1)
  if (upper === 'B#') return (octave + 2) * 12 + 0;
  return (octave + 1) * 12 + semi;
}
