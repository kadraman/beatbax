/**
 * Playback range helpers for Pattern Grid seek and loop (spec 014, phases 1–3).
 *
 * Steps are global ISM event indices: one resolved channel event per step, the
 * same coordinate system as `buildChannelTimelines` / Pattern Grid blocks.
 */

export type PlaybackSnapMode = 'pattern' | 'bar' | 'step';

export interface PlaybackRange {
  startStep: number;
  /** Exclusive end step. Omit to play to the end of the song. */
  endStep?: number | null;
  /** Repeat `[startStep, endStep)` until stopped. Requires `endStep`. */
  loop?: boolean;
  snap?: PlaybackSnapMode;
}

export interface LoopRange {
  startStep: number;
  endStep: number;
}

export interface NormalizedPlaybackRange {
  startStep: number;
  endStep: number;
  loop: boolean;
}

export interface SlicedSong {
  /** Shallow song copy whose channels hold only the events in `[startStep, endStep)`. */
  song: any;
  range: NormalizedPlaybackRange;
  /** Longest channel event count in the full song. */
  fullSteps: number;
  /** Per channel: note/named events before `startStep` (Player position counter offset). */
  noteOffsets: Map<number, number>;
  /** Per channel: note/named events in the full song. */
  noteTotals: Map<number, number>;
}

function channelEvents(ch: any): any[] {
  if (Array.isArray(ch?.events)) return ch.events;
  if (Array.isArray(ch?.pat)) return ch.pat;
  return [];
}

function isNoteEvent(ev: any): boolean {
  return !!ev && typeof ev === 'object' && (ev.type === 'note' || ev.type === 'named');
}

/** Longest channel event count (global step total) of a resolved song. */
export function songStepCount(song: any): number {
  let max = 0;
  for (const ch of song?.channels ?? []) {
    max = Math.max(max, channelEvents(ch).length);
  }
  return max;
}

/**
 * Clamp a range to the song. Returns null when the range is empty, starts at or
 * past the end, or asks to loop without a usable end step.
 */
export function normalizePlaybackRange(
  range: PlaybackRange,
  fullSteps: number,
): NormalizedPlaybackRange | null {
  if (!Number.isFinite(range.startStep) || fullSteps <= 0) return null;
  const startStep = Math.max(0, Math.floor(range.startStep));
  if (startStep >= fullSteps) return null;
  const hasEnd = range.endStep !== undefined && range.endStep !== null && Number.isFinite(range.endStep);
  if (range.loop && !hasEnd) return null;
  const endStep = hasEnd ? Math.min(fullSteps, Math.floor(range.endStep as number)) : fullSteps;
  if (endStep <= startStep) return null;
  return { startStep, endStep, loop: range.loop === true };
}

/**
 * Build a playable copy of a resolved song limited to `[startStep, endStep)`.
 *
 * Valid at pattern boundaries: resolved note events carry their instrument and
 * instrument properties, so no directive state is lost by dropping earlier steps.
 * A loop range sets `play.repeat` on the copy; a play-from range clears it.
 */
export function sliceSongForRange(song: any, range: PlaybackRange): SlicedSong | null {
  const fullSteps = songStepCount(song);
  const normalized = normalizePlaybackRange(range, fullSteps);
  if (!normalized) return null;

  const noteOffsets = new Map<number, number>();
  const noteTotals = new Map<number, number>();
  const channels = (song?.channels ?? []).map((ch: any) => {
    const events = channelEvents(ch);
    let before = 0;
    let total = 0;
    for (let i = 0; i < events.length; i++) {
      if (!isNoteEvent(events[i])) continue;
      total++;
      if (i < normalized.startStep) before++;
    }
    noteOffsets.set(ch.id, before);
    noteTotals.set(ch.id, total);
    const sliced = events.slice(normalized.startStep, normalized.endStep);
    return { ...ch, events: sliced, pat: sliced };
  });

  const play = { ...(song?.play ?? {}), repeat: normalized.loop };
  return {
    song: { ...song, channels, play },
    range: normalized,
    fullSteps,
    noteOffsets,
    noteTotals,
  };
}

/** Sorted unique block boundaries across all rows, always including 0 and `totalSteps`. */
export function collectStepBoundaries(
  rows: ReadonlyArray<ReadonlyArray<{ startStep: number; endStep: number }>>,
  totalSteps: number,
): number[] {
  const set = new Set<number>([0]);
  if (totalSteps > 0) set.add(totalSteps);
  for (const row of rows) {
    for (const seg of row) {
      if (seg.startStep >= 0 && seg.startStep <= totalSteps) set.add(seg.startStep);
      if (seg.endStep >= 0 && seg.endStep <= totalSteps) set.add(seg.endStep);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** Largest boundary at or before `step`. */
export function snapStepDown(step: number, boundaries: readonly number[]): number {
  let out = boundaries[0] ?? 0;
  for (const b of boundaries) {
    if (b <= step) out = b;
    else break;
  }
  return out;
}

/** Smallest boundary at or after `step` (last boundary when past the end). */
export function snapStepUp(step: number, boundaries: readonly number[]): number {
  for (const b of boundaries) {
    if (b >= step) return b;
  }
  return boundaries[boundaries.length - 1] ?? 0;
}

/** Nearest boundary to `step` (ties resolve to the earlier boundary). */
export function snapStepNearest(step: number, boundaries: readonly number[]): number {
  const down = snapStepDown(step, boundaries);
  const up = snapStepUp(step, boundaries);
  return step - down <= up - step ? down : up;
}

/**
 * Loop range covering every block touched by `[a, b]`, snapped outward to
 * boundaries. Returns null when the result is shorter than one block.
 */
export function snapLoopRange(a: number, b: number, boundaries: readonly number[]): LoopRange | null {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const startStep = snapStepDown(lo, boundaries);
  let endStep = snapStepUp(hi, boundaries);
  if (endStep <= startStep) {
    const next = boundaries.find((x) => x > startStep);
    if (next === undefined) return null;
    endStep = next;
  }
  return { startStep, endStep };
}
