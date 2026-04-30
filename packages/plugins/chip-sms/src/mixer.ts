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
 *Noise is typically mixed slightly lower than tones for balanced output.
 */
export const SMS_NOISE_GAIN = 0.30;

/**
 * Master gain multiplier for overall SMS output.
 * nodThis scales all channels equally to match the typical volume
 * level of SMS music relative to other chips (GB, NES).
 */
export const SMS_MASTER_GAIN = 1.1;

/** Mix gains for each channel type. */
export const SMS_MIX_GAIN = {
  tone: SMS_TONE_GAIN * SMS_MASTER_GAIN,
  noise: SMS_NOISE_GAIN * SMS_MASTER_GAIN,
} as const;

// ─── Web Audio normalization ─────────────────────────────────────────────────

/**
 * Web Audio normalization mode.
 * - 'normalized': Normalize output to prevent clipping (default)
 * - 'hardware': Use hardware-accurate gain values (may clip)
 */
export type SmsWebAudioMixMode = 'normalized' | 'hardware';

let smsWebAudioMixMode: SmsWebAudioMixMode = 'normalized';

/** Set the Web Audio mix mode. */
export function setSmsWebAudioMixMode(mode: SmsWebAudioMixMode): void {
  smsWebAudioMixMode = mode;
}

/** Get the current Web Audio mix mode. */
export function getSmsWebAudioMixMode(): SmsWebAudioMixMode {
  return smsWebAudioMixMode;
}

/**
 * Get the normalization factor based on current mode.
 * In normalized mode, we reduce gain to prevent clipping with max volume notes.
 */
export function getSmsWebAudioNorm(): number {
  return smsWebAudioMixMode === 'normalized' ? 0.7 : 1.0;
}

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
 * For mono output, this just copies the mixed signal to both channels.
 * For stereo output with Game Gear routing, applies the pan gains.
 */
export function applyStereoRouting(
  input: Float32Array, // Mono mixed buffer
  output: Float32Array, // Stereo output buffer (2x size of input)
  channelPans: (GGPan | undefined)[]
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
    
    // For v1, we'll use a simple approach: apply average pan to all channels
    // In a more sophisticated implementation, we'd track per-channel pan
    const [leftGain, rightGain] = ggPanToGains(channelPans[0]); // Use first channel's pan for now
    
    output[outputIndex] = sample * leftGain;
    output[outputIndex + 1] = sample * rightGain;
  }
}
