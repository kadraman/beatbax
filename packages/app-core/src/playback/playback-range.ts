/**
 * Playback range helpers for Pattern Grid seek and loop (spec 014).
 *
 * Steps are global ISM event indices: one resolved channel event per step, the
 * same coordinate system as `buildChannelTimelines` / Pattern Grid blocks.
 * Phase 4: step snap helpers and sustain retrigger when slicing mid-hold.
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

function isSustainEvent(ev: any): boolean {
  if (ev === '_' || ev === '-') return true;
  return !!ev && typeof ev === 'object' && ev.type === 'sustain';
}

/**
 * Slice channel events to `[startStep, endStep)`. When the window opens on a
 * sustain that continues a note/named event before `startStep`, replace the
 * first leading sustain with a copy of that held event so playback retriggers
 * the remaining hold (spec 014 phase 4).
 */
export function sliceChannelEventsForRange(
  events: readonly any[],
  startStep: number,
  endStep: number,
): any[] {
  const sliced = events.slice(startStep, endStep);
  if (sliced.length === 0 || !isSustainEvent(sliced[0])) return sliced;

  let held: any = null;
  for (let i = startStep - 1; i >= 0; i--) {
    const ev = events[i];
    if (isSustainEvent(ev)) continue;
    if (isNoteEvent(ev)) {
      held = ev;
      break;
    }
    break;
  }
  if (!held) return sliced;

  return [{ ...held }, ...sliced.slice(1)];
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
 * Resolved note events carry their instrument and instrument properties, so no
 * directive state is lost by dropping earlier steps. Mid-hold starts retrigger
 * the held note for the remaining sustains (see `sliceChannelEventsForRange`).
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
    const sliced = sliceChannelEventsForRange(events, normalized.startStep, normalized.endStep);
    // Retriggered hold is the held note again; subtract it from the offset so
    // glyphs/playhead report that note's index, not the next one.
    if (
      before > 0
      && sliced.length > 0
      && isNoteEvent(sliced[0])
      && isSustainEvent(events[normalized.startStep])
    ) {
      before -= 1;
    }
    noteOffsets.set(ch.id, before);
    noteTotals.set(ch.id, total);
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

/**
 * Pending start at an integer global step. Never lands on `totalSteps`
 * (playback cannot start at the song end).
 */
export function clampStartStep(step: number, totalSteps: number, mode: 'down' | 'nearest' = 'down'): number {
  if (totalSteps <= 0) return 0;
  const raw = mode === 'nearest' ? Math.round(step) : Math.floor(step);
  return Math.max(0, Math.min(totalSteps - 1, raw));
}

/**
 * Loop range snapped outward to integer steps. Minimum length is one step.
 * Returns null when `totalSteps` is empty or the range cannot fit.
 */
export function snapLoopRangeBySteps(a: number, b: number, totalSteps: number): LoopRange | null {
  if (totalSteps <= 0) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const startStep = Math.max(0, Math.min(totalSteps - 1, Math.floor(lo)));
  let endStep = Math.max(startStep + 1, Math.min(totalSteps, Math.ceil(hi)));
  if (endStep <= startStep) endStep = Math.min(totalSteps, startStep + 1);
  if (endStep <= startStep) return null;
  return { startStep, endStep };
}
