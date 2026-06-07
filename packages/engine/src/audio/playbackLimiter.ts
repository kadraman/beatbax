/**
 * Offline peak-down limiting for CLI/headless playback.
 * Matches pcmRenderer's clip-prevention ceiling (0.95) so --play-gain 1.0 is safe.
 */

export const PLAYBACK_PEAK_CEILING = 0.95;

/**
 * Scale buffer down in-place when peak exceeds `ceiling`.
 * @returns true when limiting was applied.
 */
export function peakLimitForPlayback(
  buffer: Float32Array,
  ceiling: number = PLAYBACK_PEAK_CEILING,
): boolean {
  let max = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > max) max = abs;
  }

  if (max <= ceiling || max === 0) return false;

  const scale = ceiling / max;
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] *= scale;
  }
  return true;
}
