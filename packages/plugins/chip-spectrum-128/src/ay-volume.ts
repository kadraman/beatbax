/**
 * AY-3-8912 / YM2149 amplitude → PCM gain.
 *
 * Hardware attenuation is logarithmic (~1.5 dB per step), not linear `vol/15`.
 * Preview uses a normalised DAC table for authentic step relationships, then
 * scales so a full three-channel mix targets the same peak headroom as NES/SMS
 * (~0.85). Absolute LUFS may still differ from Arkos Tracker exports — BeatBax
 * prioritises cross-chip preview comfort over matching AT3 WAV loudness.
 *
 * Table values follow the common normalised AY DAC levels used by emulators
 * (level 15 = 1.0). See also SMS `SMS_TARGET_PEAK` for the shared headroom goal.
 */

/**
 * Relative AY DAC output for attenuation levels 0–15 (level 15 = 1.0).
 * Level 0 is silent; steps approximate the AY-3-8912 logarithmic ladder.
 */
export const AY_DAC_LEVELS: readonly number[] = [
  0.0,
  0.0137,
  0.0205,
  0.0291,
  0.0423,
  0.0618,
  0.0847,
  0.1369,
  0.1691,
  0.2647,
  0.3527,
  0.4499,
  0.6384,
  0.7307,
  0.8359,
  1.0,
] as const;

/**
 * Target peak when all three AY channels play at vol=15 simultaneously
 * (worst-case coherent sum). Matches NES/SMS full-mix headroom.
 */
export const AY_TARGET_PEAK = 0.85;

/** Per-channel peak gain at vol=15 so three channels sum to {@link AY_TARGET_PEAK}. */
export const AY_CHANNEL_PEAK = AY_TARGET_PEAK / 3;

/** Clamp a BeatBax / register amplitude to the 4-bit AY range. */
export function clampAyAmplitude(amplitude: number): number {
  if (!Number.isFinite(amplitude)) return 0;
  return Math.max(0, Math.min(15, Math.round(amplitude)));
}

/**
 * Normalised DAC level for amplitude 0–15 (0 = silent, 15 = 1.0).
 * Fractional amplitudes are rounded to the nearest step (hardware is 4-bit).
 */
export function ayDacNormalized(amplitude: number): number {
  return AY_DAC_LEVELS[clampAyAmplitude(amplitude)] ?? 0;
}

/**
 * Peak linear PCM gain (0–1) for an AY amplitude 0–15.
 * Applies the DAC curve and per-channel peak normalisation.
 */
export function amplitudeToGain(amplitude: number): number {
  return ayDacNormalized(amplitude) * AY_CHANNEL_PEAK;
}
