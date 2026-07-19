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
import type { InstrumentNode } from '@beatbax/engine';
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
 *
 * Formula: N_env = floor(f_clock / (256 × f_note))
 *
 * One envelope step per tone period at this setting — useful when the envelope
 * alone defines pitch. For buzz bass (tone + fast AM), use {@link freqToBuzzBassEnvPeriod}.
 *
 * @param freq - Note frequency in Hz
 */
export function freqToEnvPeriod(freq: number): number {
  if (freq <= 0) return 1;
  const clock = getPlatformProfile().ayClockHz;
  return Math.max(1, Math.min(65535, Math.floor(clock / (256 * freq))));
}

/** R13 shape 8 (1000): continuous sawtooth decay — classic Spectrum buzz-bass timbre. */
export const AY_BUZZ_BASS_ENVELOPE_SHAPE = 8;

/** R13 shape 10 (1010): two saw-down legs per cycle — sharper alternate buzz. */
export const AY_BUZZ_BASS_ENVELOPE_SHAPE_ALT = 10;
/** @deprecated Use {@link AY_BUZZ_BASS_ENVELOPE_SHAPE_ALT}. */
export const AY_BUZZ_BASS_ENVELOPE_SHAPE_ARKOS = AY_BUZZ_BASS_ENVELOPE_SHAPE_ALT;

/**
 * Resolve R13 envelope shape for `env_bass=true` instruments.
 * Defaults to {@link AY_BUZZ_BASS_ENVELOPE_SHAPE} when omitted.
 */
export function resolveEnvShape(inst: InstrumentNode): number {
  const raw = (inst as { env_shape?: number | string }).env_shape;
  if (raw === undefined || raw === null || raw === '') {
    return AY_BUZZ_BASS_ENVELOPE_SHAPE;
  }
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return AY_BUZZ_BASS_ENVELOPE_SHAPE;
  return Math.max(0, Math.min(15, n));
}

/**
 * PCM preview gain boost for env_bass. Sawtooth AM through the AY DAC averages
 * well below a steady square at the same `vol`; this restores comparable
 * loudness to vol-matched tones.
 */
export const AY_BUZZ_BASS_LOUDNESS_COMPENSATION = 2.5;

/**
 * Target envelope level steps per tone period. Higher = faster AM, grittier buzz.
 * At bass frequencies N_env often clamps to 1, yielding ~100+ steps/period (many
 * complete 16-step sawtooth cycles per wave). Values ≤16 sound like tremolo/vibrato.
 */
export const AY_BUZZ_BASS_STEPS_PER_TONE = 128;

/**
 * Envelope period for `env_bass=true` (square tone × hardware envelope).
 *
 * Picks N_env so the hardware envelope advances about
 * {@link AY_BUZZ_BASS_STEPS_PER_TONE} times per tone period. Use shape 8 (saw
 * down repeat), not zigzag — triangle AM reads as vibrato on held bass notes.
 */
export function freqToBuzzBassEnvPeriod(freq: number): number {
  const tonePeriod = freqToTonePeriod(freq);
  const divisor = 16 * AY_BUZZ_BASS_STEPS_PER_TONE;
  return Math.max(1, Math.min(65535, Math.floor(tonePeriod / divisor)));
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
