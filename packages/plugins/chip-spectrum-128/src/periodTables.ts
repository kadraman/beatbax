/**
 * Period tables and frequency conversion utilities for the AY-3-8912 PSG.
 *
 * Tone period formula:  N = floor(f_clock / (16 × f_tone))   12-bit, clamp 1–4095
 * Buzz-bass formula:    N_env = floor(f_clock / (256 × f_note))
 *
 * Both formulas use the AY clock from platform-profiles.ts, NOT the CPU clock.
 *
 * References:
 *   - hardware_guide.md
 *   - AY-3-8912 datasheet
 */
import { midiToFreq } from '@beatbax/engine';
import { getPlatformProfile, AY_CLOCK_SPECTRUM_128 } from './platform-profiles.js';

/**
 * Convert a frequency (Hz) to a 12-bit AY tone period register value.
 * Uses the currently active platform clock.
 *
 * @param freq - Target frequency in Hz
 * @returns Tone period N (1–4095), or 1 if freq is 0/negative
 */
export function freqToTonePeriod(freq: number): number {
  if (freq <= 0) return 1;
  const clock = getPlatformProfile().ayClockHz;
  return Math.max(1, Math.min(4095, Math.floor(clock / (16 * freq))));
}

/**
 * Convert a 12-bit AY tone period register value to frequency (Hz).
 *
 * @param period - 12-bit tone period (1–4095)
 */
export function tonePeriodToFreq(period: number): number {
  const clock = getPlatformProfile().ayClockHz;
  return clock / (16 * Math.max(1, period));
}

/**
 * Convert a frequency (Hz) to a 16-bit AY envelope period register value.
 * Used for buzz-bass mode (env_bass=true): the envelope generator oscillates
 * at the note frequency instead of the tone oscillator.
 *
 * Formula: N_env = floor(f_clock / (256 × f_note))
 *
 * @param freq - Note frequency in Hz
 */
export function freqToEnvPeriod(freq: number): number {
  if (freq <= 0) return 1;
  const clock = getPlatformProfile().ayClockHz;
  return Math.max(1, Math.min(65535, Math.floor(clock / (256 * freq))));
}

/**
 * Convert a MIDI note number to an AY tone period.
 * Covers MIDI notes 12–108 (C0–C8) for the Spectrum 128 clock.
 */
export function midiToTonePeriod(midi: number): number {
  const freq = midiToFreq(midi);
  return freqToTonePeriod(freq);
}

/**
 * Convert a MIDI note number to an AY envelope period (buzz-bass).
 */
export function midiToEnvPeriod(midi: number): number {
  const freq = midiToFreq(midi);
  return freqToEnvPeriod(freq);
}

/**
 * Precomputed tone period table keyed by MIDI note (12–108) for the
 * Spectrum 128 clock (reference; actual playback uses getPlatformProfile()).
 */
export const AY_TONE_PERIOD_TABLE_SPECTRUM_128: Record<number, number> = (function () {
  const table: Record<number, number> = {};
  for (let midi = 12; midi <= 108; midi++) {
    const freq = midiToFreq(midi);
    table[midi] = Math.max(1, Math.min(4095, Math.floor(AY_CLOCK_SPECTRUM_128 / (16 * freq))));
  }
  return table;
})();
