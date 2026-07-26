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
 * At full volume (all channels at maximum) before listening gain:
 *   output ≈ 0.00752 × 30 + 0.00851 × 15 + 0.00494 × 15 + 0.00335 × 127 ≈ 0.855
 *
 * Web Audio routes each channel independently (unlike a combined `nesMix()` bus),
 * so a single pulse peaks around ~0.11 — much quieter than SMS/GB (~0.22). A modest
 * listening gain brings sparse arrangements closer without restoring the old ~8.9×
 * unity-normalized WebAudio mode (which clipped dense 5-channel mixes). Dense peaks
 * above 1.0 are soft-clipped by the player limiter / PCM peak-down.
 */

/**
 * Extra loudness for listening parity with SMS/GB.
 * Hardware-faithful weights alone sound thin when channels sum in parallel.
 */
export const NES_LISTENING_GAIN = 1.75;

/** Linear approximation gain weights for each NES channel group (includes listening gain). */
export const NES_MIX_GAIN = {
  pulse:    0.00752 * NES_LISTENING_GAIN,  // per pulse channel (applied twice for pulse1 + pulse2)
  triangle: 0.00851 * NES_LISTENING_GAIN,
  noise:    0.00494 * NES_LISTENING_GAIN,
  dmc:      0.00335 * NES_LISTENING_GAIN,
} as const;

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
 * Returns a value in approximately [0, 0.855 × NES_LISTENING_GAIN] for maximum inputs.
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
