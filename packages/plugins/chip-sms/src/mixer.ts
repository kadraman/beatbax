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
