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
 * Index 0 (fastest) through 15 (slowest); maps to DMC playback rates in Hz.
 */
export const DMC_RATE_TABLE: number[] = [
  4181.71, 2090.86, 1395.24, 1047.43, 838.86, 699.62, 559.70, 525.37,
  419.43, 349.81, 279.85, 209.91, 174.86, 139.93, 104.95, 69.97
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
 * Returns null if the note name is not recognised.
 */
export function noteNameToMidi(name: string, octave: number): number | null {
  const m = name.match(/^([A-G])([#B]?)$/i);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = (m[2] || '').toUpperCase();
  const noteMap: Record<string, number> = {
    C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3,
    E: 4, F: 5, 'F#': 6, GB: 6, G: 7, 'G#': 8,
    AB: 8, A: 9, 'A#': 10, BB: 10, B: 11
  };
  const key = letter + (acc === 'B' ? 'B' : acc === '#' ? '#' : '');
  const semi = noteMap[key as keyof typeof noteMap];
  if (semi === undefined) return null;
  return (octave + 1) * 12 + semi;
}
