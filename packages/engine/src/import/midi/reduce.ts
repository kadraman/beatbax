/**
 * Per-mapping chord / overlap reduction (feature 089, spec FR-021) and range clipping.
 */
import type { ArrangementContext } from './arrangement.js';
import { statsFor } from './arrangement.js';
import { gridToTicks } from './config.js';
import { resolveMonophonic } from './pack.js';
import type {
  ClassifiedStream,
  MidiConvertOptions,
  MonoPolicy,
  QuantizedNote,
} from './types.js';

export interface ReduceResult {
  kept: QuantizedNote[];
  dropped: number;
}

function byStartThenEarliestRule(a: QuantizedNote, b: QuantizedNote): number {
  if (a.startTick !== b.startTick) return a.startTick - b.startTick;
  if (b.velocity !== a.velocity) return b.velocity - a.velocity;
  if (a.pitch !== b.pitch) return a.pitch - b.pitch;
  return a.sourceEventIndex - b.sourceEventIndex;
}

/** Pick the note kept among notes starting on the same tick. */
function pickSimultaneous(group: QuantizedNote[], policy: MonoPolicy): QuantizedNote {
  if (policy === 'highest' || policy === 'lowest') {
    let best = group[0]!;
    for (const n of group) {
      if (policy === 'highest' ? n.pitch > best.pitch : n.pitch < best.pitch) best = n;
    }
    return best;
  }
  // newest: same-tick ties use the 006 order (louder, then lower pitch).
  return group[0]!;
}

/**
 * Reduce overlapping notes to one voice.
 *
 * - `earliest`: 006 rule (earliest start, then higher velocity, then lower pitch).
 * - `highest` / `lowest`: keep the highest / lowest of simultaneous notes. A note starting
 *   while a kept note sounds wins if its pitch is ≥ / ≤ the held pitch, or if the held
 *   note's remaining tail is ≤ one grid step or ≤ ¼ of its duration (legato tail rule).
 * - `newest`: a new note always wins.
 *
 * A winning note shortens the held note to end where it starts; a losing note is dropped.
 * Input notes are not mutated.
 */
export function reduceMono(notes: QuantizedNote[], policy: MonoPolicy, gridTicks: number): ReduceResult {
  if (notes.length === 0) return { kept: [], dropped: 0 };
  if (policy === 'earliest') {
    const { kept, dropped } = resolveMonophonic(notes, [], 'reduce');
    return { kept: [...kept].sort(byStartThenEarliestRule), dropped };
  }

  const sorted = [...notes].sort(byStartThenEarliestRule);
  const kept: QuantizedNote[] = [];
  let dropped = 0;

  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i]!.startTick;
    let j = i;
    while (j < sorted.length && sorted[j]!.startTick === start) j += 1;
    const group = sorted.slice(i, j);
    i = j;

    const candidate = pickSimultaneous(group, policy);
    dropped += group.length - 1;

    const held = kept[kept.length - 1];
    if (!held || held.startTick + held.durationTicks <= candidate.startTick) {
      kept.push({ ...candidate });
      continue;
    }

    const tail = held.startTick + held.durationTicks - candidate.startTick;
    let wins: boolean;
    if (policy === 'newest') {
      wins = true;
    } else {
      const pitchWins = policy === 'highest' ? candidate.pitch >= held.pitch : candidate.pitch <= held.pitch;
      wins = pitchWins || tail <= gridTicks || tail <= held.durationTicks / 4;
    }

    if (wins) {
      held.durationTicks = Math.max(1, candidate.startTick - held.startTick);
      kept.push({ ...candidate });
    } else {
      dropped += 1;
    }
  }

  return { kept, dropped };
}

/** Shorten notes that extend past `endTick` so they end at it (spec FR-013). */
export function clipToRange(notes: QuantizedNote[], endTick: number): QuantizedNote[] {
  return notes.map((n) =>
    n.startTick + n.durationTicks > endTick
      ? { ...n, durationTicks: Math.max(1, endTick - n.startTick) }
      : n,
  );
}

/**
 * Apply each stream's reduction policy before packing. Streams without a policy
 * (006 behaviour) and drum streams pass through unchanged.
 */
export function reduceStreams(
  streams: ClassifiedStream[],
  options: MidiConvertOptions,
  ctx: ArrangementContext,
): ClassifiedStream[] {
  const gridTicks = gridToTicks(options.quantize.grid, options.ticksPerBeat);
  const mappings = options.trackMappings ?? [];
  return streams.map((s) => {
    if (!s.mono || s.isDrum) return s;
    const { kept, dropped } = reduceMono(s.notes, s.mono, gridTicks);
    if (dropped > 0) {
      ctx.reduceDropped += dropped;
      if (s.mappingIndex != null && mappings[s.mappingIndex]) {
        statsFor(ctx, s.mappingIndex, mappings[s.mappingIndex]!).monoReduce += dropped;
      }
    }
    return { ...s, notes: kept };
  });
}
