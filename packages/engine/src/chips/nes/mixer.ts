/**
 * NES non-linear mixer — linear weighted-sum approximation.
 *
 * The NES hardware mixer combines five channels through two non-linear DAC
 * lookup tables: one for the two pulse channels, another for triangle, noise,
 * and DMC. This module provides a linear approximation using gain weights
 * derived from the first-order slopes of those tables near mid-range.
 *
 * The approximation formula is the standard NESDev reference:
 *   output = 0.00752 × (pulse1 + pulse2) + 0.00851 × tri + 0.00494 × noise + 0.00335 × dmc
 *
 * At full volume (all channels at maximum):
 *   output ≈ 0.00752 × 30 + 0.00851 × 15 + 0.00494 × 15 + 0.00335 × 127 ≈ 0.855
 *
 * This keeps the master output below 1.0 without a separate normalization pass,
 * matching the perceived loudness of a real NES at approximately 85% of full scale.
 */

/** Linear approximation gain weights for each NES channel group. */
export const NES_MIX_GAIN = {
  pulse:    0.00752,  // per pulse channel (applied twice for pulse1 + pulse2)
  triangle: 0.00851,
  noise:    0.00494,
  dmc:      0.00335,
} as const;

export type NesWebAudioMixMode = 'normalized' | 'hardware';

const NES_WEB_AUDIO_MIX_MODE_KEY = '__beatbax_nes_web_audio_mix_mode';

function readGlobalMixMode(): NesWebAudioMixMode | null {
  const raw = (globalThis as Record<string, unknown>)[NES_WEB_AUDIO_MIX_MODE_KEY];
  if (raw === 'hardware' || raw === 'normalized') return raw;
  return null;
}

function writeGlobalMixMode(mode: NesWebAudioMixMode): void {
  (globalThis as Record<string, unknown>)[NES_WEB_AUDIO_MIX_MODE_KEY] = mode;
}

/**
 * Web Audio loudness normalization factor for NES tone channels.
 *
 * The NES hardware mixer weights (NES_MIX_GAIN) are calibrated for combined
 * PCM output where all five channels sum to ~0.855 at maximum.  In the Web
 * Audio path each channel feeds directly to `AudioContext.destination`, so
 * the hardware weights produce gains far below 1.0 per channel (e.g. a pulse
 * channel at max volume reaches only 15 × 0.00752 ≈ 0.113).
 *
 * The built-in Game Boy backends output each channel in the 0–1 range, making
 * NES songs sound ~9× quieter and the VU meter segments barely light.
 *
 * This factor (≈ 8.865) is applied in `createPlaybackNodes()` for pulse,
 * triangle, noise, and DMC so that a single channel at maximum volume produces
 * approximately the same loudness as a Game Boy channel at maximum volume.
 *
 * The PCM render path (`render()`) intentionally uses the raw NES_MIX_GAIN
 * values and is unaffected, preserving hardware-accurate CLI output.
 *
 * DMC applies the same normalization in its WebAudio path; its PCM render path
 * remains hardware-scaled, preserving hardware-accurate CLI output.
 */
export const NES_WEB_AUDIO_NORM = 1.0 / (NES_MIX_GAIN.pulse * 15);

/** Set WebAudio loudness mode for NES browser playback/rendering. */
export function setNesWebAudioMixMode(mode: NesWebAudioMixMode): void {
  writeGlobalMixMode(mode);
}

/** Get current WebAudio loudness mode for NES browser playback/rendering. */
export function getNesWebAudioMixMode(): NesWebAudioMixMode {
  return readGlobalMixMode() ?? 'normalized';
}

/**
 * Return the effective WebAudio normalization factor for the current mode.
 * - normalized: loudness parity with BeatBax Game Boy backends.
 * - hardware: raw NES linear-mixer scaling (closer to tracker/hardware output level).
 */
export function getNesWebAudioNorm(): number {
  return getNesWebAudioMixMode() === 'hardware' ? 1 : NES_WEB_AUDIO_NORM;
}

/**
 * Compute the mixed NES output sample using the linear approximation.
 *
 * All inputs should be in the range [0, max] where max matches the hardware
 * scale for each channel:
 *   - pulse1, pulse2: 0–15 (4-bit amplitude)
 *   - tri:            0–15
 *   - noise:          0–15
 *   - dmc:            0–127 (7-bit DAC)
 *
 * Returns a value in approximately [0, 0.855] for maximum inputs.
 */
export function nesMix(
  p1: number,
  p2: number,
  tri: number,
  noise: number,
  dmc: number
): number {
  const pulse = NES_MIX_GAIN.pulse * (p1 + p2);
  const tnd   = NES_MIX_GAIN.triangle * tri + NES_MIX_GAIN.noise * noise + NES_MIX_GAIN.dmc * dmc;
  return pulse + tnd;
}

/**
 * Create a set of pre-scaled WebAudio GainNode weights for real-time mixing.
 *
 * Call once at context initialization; wire each channel's output through its
 * corresponding gain node, then sum all gains into a master output node.
 *
 * Returns gain values (not GainNode objects) so callers can set `.gain.value`
 * on their own GainNodes — avoids tight coupling to the WebAudio API here.
 */
export function getNesGainWeights(): {
  pulse1: number;
  pulse2: number;
  triangle: number;
  noise: number;
  dmc: number;
} {
  return {
    pulse1:   NES_MIX_GAIN.pulse,
    pulse2:   NES_MIX_GAIN.pulse,
    triangle: NES_MIX_GAIN.triangle,
    noise:    NES_MIX_GAIN.noise,
    dmc:      NES_MIX_GAIN.dmc,
  };
}
