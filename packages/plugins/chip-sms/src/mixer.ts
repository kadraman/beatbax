/**
 * SMS SN76489 mixer and gain constants.
 *
 * The SN76489 produces square waves (tone channels) and noise (LFSR).
 * All channels share the same 4-bit volume attenuation (0-15).
 *
 * Relative channel volumes (empirically determined):
 * - Tone channels: similar amplitude
 * - Noise channel: slightly quieter than tones (subjective, varies by game)
 *
 * For BeatBax, we use a simple equal-power mix for all 4 channels,
 * with an overall master gain to match typical SMS playback levels.
 */

// ─── Gain constants ──────────────────────────────────────────────────────────

/**
 * Base gain for each tone channel (Tone1, Tone2, Tone3).
 * Square wave at 50% duty, normalized to reasonable playback level.
 */
export const SMS_TONE_GAIN = 0.35;

/**
 * Base gain for noise channel.
 * Noise is typically mixed slightly lower than tones for balanced output.
 */
export const SMS_NOISE_GAIN = 0.30;

/**
 * Linear sum when three tone channels and noise all play at vol=0 (loudest).
 * Web Audio routes each channel independently to the master bus, so per-channel
 * gains must leave headroom for simultaneous max-level notes.
 */
const SMS_MAX_RAW_SUM = 3 * SMS_TONE_GAIN + SMS_NOISE_GAIN;

/**
 * Target peak when all four channels are simultaneously at max loudness.
 * Matches NES PCM combined-mix headroom (~0.85); master limiter handles transients.
 */
export const SMS_TARGET_PEAK = 0.85;

/**
 * Master gain multiplier applied equally to all SMS channels.
 * Scales raw tone/noise weights so a full 4-channel arrangement stays below clipping.
 */
export const SMS_MASTER_GAIN = SMS_TARGET_PEAK / SMS_MAX_RAW_SUM;

/** Mix gains for each channel type (PCM and Web Audio use the same values). */
export const SMS_MIX_GAIN = {
  tone: SMS_TONE_GAIN * SMS_MASTER_GAIN,
  noise: SMS_NOISE_GAIN * SMS_MASTER_GAIN,
} as const;

/**
 * Compute the mix for all SMS channels (for PCM rendering).
 * Combines the per-channel gain with the volume attenuation.
 *
 * @param toneGain - Gain for tone channels (0-1)
 * @param noiseGain - Gain for noise channel (0-1)
 * @param volume - Volume attenuation (0-15, where 0=loudest)
 * @returns Combined gain value
 */
export function smsMix(toneGain: number, noiseGain: number, attenuation: number): number {
  // Since tone Gain already includes master, we just scale by attenuation
  const gain = toneGain + noiseGain;
  // Convert attenuation (0-15) to linear gain (1.0-0.0)
  const volScale = 1.0 - (attenuation / 15);
  return gain * volScale;
}

// ─── Stereo Routing ─────────────────────────────────────────────────────────

/**
 * Game Gear stereo pan values.
 * Each channel can be routed to Left, Center (both), or Right.
 */
export type GGPan = 'L' | 'C' | 'R';

/**
 * Convert gg:pan string to stereo routing multiplier.
 * Returns [leftGain, rightGain] where each is 0.0 or 1.0
 */
export function ggPanToGains(pan: string | undefined): [number, number] {
  if (!pan) return [1.0, 1.0]; // Default to center if not specified

  const normalized = pan.toString().toLowerCase();
  switch (normalized) {
    case 'l':
    case 'left':
      return [1.0, 0.0]; // Left only
    case 'r':
    case 'right':
      return [0.0, 1.0]; // Right only
    case 'c':
    case 'center':
    default:
      return [1.0, 1.0]; // Both channels (center)
  }
}

/**
 * Apply stereo routing to a sample buffer.
 * This is a post-mix helper, so it can only apply a single pan value to the
 * already mixed mono buffer. Per-channel GG routing must be applied during
 * channel mixing before channels are summed.
 */
export function applyStereoRouting(
  input: Float32Array, // Mono mixed buffer
  output: Float32Array, // Stereo output buffer (2x size of input)
  pan?: GGPan
): void {
  const inputLength = input.length;
  const outputLength = output.length;

  // If output is same size as input, treat as mono
  if (outputLength === inputLength) {
    output.set(input);
    return;
  }

  // Stereo output: interleave left/right samples
  for (let i = 0; i < inputLength; i++) {
    const sample = input[i];
    const outputIndex = i * 2;
    const [leftGain, rightGain] = ggPanToGains(pan);

    output[outputIndex] = sample * leftGain;
    output[outputIndex + 1] = sample * rightGain;
  }
}
