/**
 * Game Boy period / frequency helper utilities.
 *
 * These functions provide conversions between the Game Boy frequency register
 * (11-bit value commonly used in pulse channels) and real-world frequency in Hz.
 *
 * Note: This module targets Day-2 accuracy goals (useful tables and round-trip
 * conversions). For bit-exact implementation we may adjust formulas to match
 * reference hardware tests.
 */

export const GB_CLOCK = 4194304; // 4.194304 MHz

/**
 * Convert Game Boy frequency-register value (0..2047) to frequency in Hz.
 *
 * Formula used (common reference):
 *   freq = 131072 / (2048 - reg)
 * which derives from a GB master clock; this is a commonly used conversion
 * for pulse channels in many references and emulators.
 */
export function freqFromRegister(reg: number): number {
  const r = Math.max(0, Math.min(2047, Math.floor(reg)));
  const denom = 2048 - r;
  if (denom <= 0) return Infinity;
  return 131072 / denom;
}

/**
 * Convert frequency in Hz to the nearest Game Boy frequency register value (0..2047).
 */
export function registerFromFreq(freq: number): number {
  if (!isFinite(freq) || freq <= 0) return 0;
  const val = Math.round(2048 - (131072 / freq));
  return Math.max(0, Math.min(2047, val));
}

export default { GB_CLOCK, freqFromRegister, registerFromFreq };
