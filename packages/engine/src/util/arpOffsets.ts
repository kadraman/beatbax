/**
 * Arpeggio offset helpers. Playback and hUGE export always treat the written note
 * as the root; list only semitone steps above it (e.g. major triad = 4,7 not 0,4,7).
 */
export function normalizeArpOffsets(offsets: number[]): number[] {
  const out = offsets.filter(n => Number.isFinite(n));
  while (out.length > 1 && out[0] === 0) out.shift();
  return out;
}

/** Root (0) plus normalized upper partials for one arpeggio cycle. */
export function arpCycleOffsets(offsets: number[]): number[] {
  const upper = normalizeArpOffsets(offsets);
  return upper.length > 0 ? [0, ...upper] : [];
}
