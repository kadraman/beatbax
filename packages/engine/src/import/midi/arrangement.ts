/**
 * Shared per-conversion state for arrangement-aware import (feature 089):
 * source bar boundaries and per-mapping note accounting.
 */
import type { ChannelContribution } from './pack.js';
import type { TempoSelection } from './timing.js';
import type {
  ChipRole,
  ConversionDiagnostic,
  MappingStats,
  MidiConvertOptions,
  TrackMapping,
} from './types.js';

/** One line of the arrangement notes: a mapping or an auto-mapped source. */
export interface AnnotationSource {
  label: string;
  instrument: string;
  /** Bar range label (mappings only). */
  bars?: string;
  kept: number;
  /** Notes selected by the mapping (mappings only). */
  matched?: number;
  laneOverlap?: number;
  monoReduce?: number;
  pitchOutOfRange?: number;
  filtered?: number;
}

export interface ArrangementAnnotation {
  channels: { channelIndex: number; role: ChipRole; sources: AnnotationSource[] }[];
  /** Mappings that did not reach any channel. */
  unplaced: AnnotationSource[];
  drumHitsDropped: number;
  unmappedDropped: { label: string; notes: number }[];
  timing: {
    policy: TempoSelection;
    sourceBpm: number;
    writtenBpm: number;
    ticksPerBeat: number;
    startBar?: number;
    endBar?: number;
    nudge: number;
    ignoredTempos: number;
    ignoredTimeSignatures: number;
  };
}

export interface ArrangementContext {
  /** Output BeatBax tick where 1-based source `bar` starts (may be negative before the window). */
  barStartTick(bar: number): number;
  stats: Map<number, MappingStats>;
  /** Unmapped notes dropped by `unmappedTracks: "drop"`, keyed by source label. */
  unmappedDropped: Map<string, number>;
  /** Notes dropped during classification (pitch out of range). */
  classifyDropped: number;
  /** Notes dropped during per-mapping reduction. */
  reduceDropped: number;
}

export function createArrangementContext(
  options: MidiConvertOptions,
  barStartTick?: (bar: number) => number,
): ArrangementContext {
  const barTicks = options.ticksPerBeat * 4;
  return {
    barStartTick: barStartTick ?? ((bar) => (bar - 1) * barTicks),
    stats: new Map(),
    unmappedDropped: new Map(),
    classifyDropped: 0,
    reduceDropped: 0,
  };
}

export function statsFor(ctx: ArrangementContext, index: number, mapping: TrackMapping): MappingStats {
  let s = ctx.stats.get(index);
  if (!s) {
    s = {
      mappingIndex: index,
      target: mapping.target,
      instrument: mapping.instrument ?? '',
      midiTrack: mapping.midiTrack,
      midiChannel: mapping.midiChannel,
      fromBar: mapping.fromBar,
      toBar: mapping.toBar,
      matched: 0,
      kept: 0,
      laneOverlap: 0,
      monoReduce: 0,
      pitchOutOfRange: 0,
      filtered: 0,
    };
    ctx.stats.set(index, s);
  }
  return s;
}

/** Ensure every configured mapping has a stats row (for annotation of unused mappings). */
export function ensureAllMappingStats(ctx: ArrangementContext, options: MidiConvertOptions): void {
  (options.trackMappings ?? []).forEach((m, i) => statsFor(ctx, i, m));
}

export function mappingLabel(s: Pick<MappingStats, 'mappingIndex' | 'midiTrack' | 'midiChannel'>): string {
  const parts: string[] = [];
  if (s.midiTrack != null) parts.push(`T${s.midiTrack}`);
  if (s.midiChannel != null) parts.push(`ch${s.midiChannel}`);
  return parts.length > 0 ? parts.join(' ') : `mapping ${s.mappingIndex}`;
}

export function barRangeLabel(fromBar?: number, toBar?: number): string {
  if (fromBar == null && toBar == null) return 'all bars';
  return `bars ${fromBar ?? 1}-${toBar ?? 'end'}`;
}

function mappingSource(s: MappingStats): AnnotationSource {
  return {
    label: mappingLabel(s),
    instrument: s.instrument || s.target,
    bars: barRangeLabel(s.fromBar, s.toBar),
    kept: s.kept,
    matched: s.matched,
    laneOverlap: s.laneOverlap,
    monoReduce: s.monoReduce,
    pitchOutOfRange: s.pitchOutOfRange,
    filtered: s.filtered,
  };
}

/** Factual arrangement notes from pack contributions, mapping stats and timing (spec FR-060). */
export function buildArrangementAnnotation(args: {
  ctx: ArrangementContext;
  contributions: ChannelContribution[];
  drumHitsDropped: number;
  timing: ArrangementAnnotation['timing'];
}): ArrangementAnnotation {
  const { ctx, contributions } = args;
  const placed = new Set<number>();
  const channels = [...contributions]
    .sort((a, b) => a.channelIndex - b.channelIndex)
    .map((c) => {
      const sources: AnnotationSource[] = [];
      const seen = new Set<number>();
      for (const src of c.sources) {
        if (src.mappingIndex != null) {
          if (seen.has(src.mappingIndex)) continue;
          seen.add(src.mappingIndex);
          placed.add(src.mappingIndex);
          const stats = ctx.stats.get(src.mappingIndex);
          if (stats) sources.push(mappingSource(stats));
        } else {
          sources.push({
            label: `auto T${src.sourceTrackIndex} ch${src.midiChannel + 1}`,
            instrument: src.instrument,
            kept: src.kept,
          });
        }
      }
      return { channelIndex: c.channelIndex, role: c.role, sources };
    });

  const unplaced = [...ctx.stats.values()]
    .filter((s) => !placed.has(s.mappingIndex))
    .sort((a, b) => a.mappingIndex - b.mappingIndex)
    .map(mappingSource);

  const unmappedDropped = [...ctx.unmappedDropped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([label, notes]) => ({ label, notes }));

  return { channels, unplaced, drumHitsDropped: args.drumHitsDropped, unmappedDropped, timing: args.timing };
}

/** One aggregated diagnostic per mapping per drop reason, plus unmapped drops (FR-026, FR-070). */
export function pushArrangementDiagnostics(ctx: ArrangementContext, diagnostics: ConversionDiagnostic[]): void {
  const rows = [...ctx.stats.values()].sort((a, b) => a.mappingIndex - b.mappingIndex);
  for (const s of rows) {
    const who = `trackMappings[${s.mappingIndex}] (${mappingLabel(s)} → ${s.target}, ${barRangeLabel(s.fromBar, s.toBar)})`;
    if (s.laneOverlap > 0) {
      diagnostics.push({
        level: 'warn',
        code: 'lane_overlap',
        message: `Dropped ${s.laneOverlap} note(s) from ${who}: overlap notes placed by earlier mappings on the lane`,
      });
    }
    if (s.monoReduce > 0) {
      diagnostics.push({
        level: 'info',
        code: 'mono_reduce',
        message: `Reduced ${s.monoReduce} overlapping note(s) from ${who} to one voice`,
      });
    }
    if (s.pitchOutOfRange > 0) {
      diagnostics.push({
        level: 'warn',
        code: 'pitch_out_of_range',
        message: `Dropped ${s.pitchOutOfRange} note(s) from ${who}: transposed pitch outside MIDI 0–127`,
      });
    }
  }
  if (ctx.unmappedDropped.size > 0) {
    const parts = [...ctx.unmappedDropped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([label, n]) => `${label} (${n} note(s))`);
    const total = [...ctx.unmappedDropped.values()].reduce((a, b) => a + b, 0);
    diagnostics.push({
      level: 'info',
      code: 'unmapped_dropped',
      message: `unmappedTracks=drop: excluded ${total} note(s) matching no mapping: ${parts.join(', ')}`,
    });
  }
}
