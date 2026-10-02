/**
 * MIDI → .bax conversion orchestration (feature 006).
 * Browser-safe: accepts MIDI bytes only (no Node `fs` / `path`).
 */
import {
  buildArrangementAnnotation,
  createArrangementContext,
  ensureAllMappingStats,
  pushArrangementDiagnostics,
} from './arrangement.js';
import { resolveConvertOptions, withConvertDefaults } from './config.js';
import { emitBaxSource } from './emit.js';
import { packChannels } from './pack.js';
import { quantizeNotes } from './quantize.js';
import { readMidiBytes } from './reader.js';
import { reduceStreams } from './reduce.js';
import { classifyStreams } from './roles.js';
import { buildPatternsAndSequences } from './reuse.js';
import {
  applyNudge,
  applyWindow,
  resolveTiming,
  sourceBarStartBaxTick,
  type TimingPlan,
} from './timing.js';
import type {
  ConversionDiagnostic,
  ConversionSummary,
  MappingStats,
  MidiConvertOptions,
  MidiConvertResult,
  MidiImportConfig,
  MidiParseResult,
} from './types.js';

export type {
  MidiConvertOptions,
  MidiConvertResult,
  MidiImportConfig,
  ConversionSummary,
  ConversionDiagnostic,
  MappingStats,
};
export type {
  MonoPolicy,
  PackingMode,
  ResolvedMidiConvertOptions,
  TempoPolicy,
  UnmappedTracksMode,
  TrackMapping,
} from './types.js';
export {
  resolveConvertOptions,
  parseImportConfig,
  defaultConvertOptions,
  parseChipId,
  parseChipRole,
  parseMidiChannel,
  parseQuantizeMode,
  parseQuantizeGrid,
} from './config.js';
export { readMidiBytes } from './reader.js';
export { quantizeNotes, midiTicksToBaxTicks } from './quantize.js';
export { classifyStreams, mapDrumPitch, DEFAULT_DRUM_MAP, hintChipRoleFromTrackName, dmcTokenForHit } from './roles.js';
export {
  emitKitLines,
  emitMelodicInstLine,
  gmFamilyFromProgram,
  instrumentNameForFamilyRole,
  buildProgramFamilyByProgram,
  mergeFamilyArticulations,
  parseGmFamily,
  parseProgramFamilyKey,
  DEFAULT_PROGRAM_FAMILY_RANGES,
  DEFAULT_FAMILY_ARTICULATIONS,
  DMC_KICK,
  DMC_SNARE,
} from './kit.js';
export { packChannels, gapFill, resolveMonophonic } from './pack.js';
export type { PackResult, ChannelContribution, ChannelSource } from './pack.js';
export { buildPatternsAndSequences, compressPlaylist, hitsToBarTokens, hashTokens } from './reuse.js';
export { emitBaxSource, formatArrangementNotes, ARRANGEMENT_NOTES_BEGIN, ARRANGEMENT_NOTES_END } from './emit.js';
export { reduceMono, clipToRange, reduceStreams } from './reduce.js';
export { adjustPitch, findOverrides } from './roles.js';
export {
  resolveTiming,
  selectSourceTempo,
  longestTempo,
  firstTempo,
  writtenBpm,
  sourceBarMidiTicks,
  sourceBarAt,
  firstTimeSignature,
  applyNudge,
  applyWindow,
} from './timing.js';
export type { TimingPlan, TempoSelection } from './timing.js';
export { createArrangementContext } from './arrangement.js';
export { inspectMidiParseResult, inspectMidiBytes, INSPECT_ACTIVITY_BLOCK_BARS } from './inspect.js';
export type { MidiInspectReport, MidiInspectTrack } from './inspect.js';
export type { ArrangementContext, ArrangementAnnotation, AnnotationSource } from './arrangement.js';

function fileBaseName(label: string): string {
  const normalized = label.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || label;
}

/**
 * v1 emits a single `bpm` and fixed `patternTicks` bars. Warn when the MIDI
 * tempo map or time-signature map cannot be represented in that model.
 * Returns the number of ignored time signature events.
 */
function pushIgnoredTimingDiagnostics(
  parsed: MidiParseResult,
  timing: TimingPlan,
  patternTicks: number,
  diagnostics: ConversionDiagnostic[],
): number {
  const ignoredTempos = timing.ignoredTempos;
  if (ignoredTempos.length > 0) {
    const changes = ignoredTempos
      .map((t) => `t=${t.midiTicks} bpm=${Math.round(t.bpm)}`)
      .join(', ');
    const selected =
      timing.policy === 'first'
        ? `after initial bpm ${Math.round(timing.sourceBpm)}`
        : timing.policy === 'longest'
          ? `other than longest-held bpm ${Math.round(timing.sourceBpm)}`
          : `(bpm override ${Math.round(timing.sourceBpm)})`;
    diagnostics.push({
      level: 'warn',
      code: 'tempo_map_ignored',
      message:
        `Ignoring ${ignoredTempos.length} MIDI tempo change(s) ${selected} ` +
        `(${changes}); output uses constant tempo`,
    });
  }

  const sigs = parsed.timeSignatures;
  if (sigs.length === 0) return 0;

  const incompatible = sigs.filter(
    (ts) => ts.numerator !== 4 || ts.denominator !== 4 || ts.midiTicks !== 0,
  );
  // Multiple events even if all 4/4 still cannot drive mid-song meter changes.
  const hasMapChanges = sigs.length > 1;
  if (incompatible.length === 0 && !hasMapChanges) return 0;

  const describe = sigs
    .map((ts) => `t=${ts.midiTicks} ${ts.numerator}/${ts.denominator}`)
    .join(', ');
  diagnostics.push({
    level: 'warn',
    code: 'time_signature_ignored',
    message:
      `Ignoring MIDI time signature map (${describe}); output uses fixed ` +
      `${patternTicks}-tick bar partitioning (4/4 at ticksPerBeat)`,
  });
  return sigs.length;
}

function safeTitle(options: MidiConvertOptions, parsed: MidiParseResult, inputLabel?: string): string {
  if (options.title) return options.title;
  if (parsed.name && parsed.name.trim()) return parsed.name.trim();
  if (inputLabel) {
    const base = fileBaseName(inputLabel).replace(/\.(mid|midi)$/i, '');
    if (base) return base;
  }
  return 'midi-import';
}

/**
 * Convert parsed MIDI + options into .bax source.
 */
export function convertMidiParseResult(
  parsed: MidiParseResult,
  convertOptions: MidiConvertOptions,
  inputLabel?: string,
): MidiConvertResult {
  const options = withConvertDefaults(convertOptions);
  const diagnostics: ConversionDiagnostic[] = [];

  if (parsed.notes.length === 0) {
    diagnostics.push({
      level: 'warn',
      code: 'empty_midi',
      message: 'MIDI file contains no note events',
    });
  }

  const timing = resolveTiming(parsed, options, diagnostics);
  const ignoredTimeSignatures = pushIgnoredTimingDiagnostics(parsed, timing, options.patternTicks, diagnostics);

  const nudged = applyNudge(parsed.notes, timing.nudgeMidiTicks);
  const quantized = applyWindow(quantizeNotes(nudged, parsed.ppq, options, diagnostics), timing);
  const ctx = createArrangementContext(
    options,
    (bar) =>
      sourceBarStartBaxTick(bar, timing.barMidiTicks, parsed.ppq, options.ticksPerBeat) - timing.windowStartTick,
  );
  ensureAllMappingStats(ctx, options);
  const streams = reduceStreams(classifyStreams(quantized, options, diagnostics, ctx), options, ctx);
  const packed = packChannels(streams, options, diagnostics, ctx);
  const notesDropped = packed.notesDropped + ctx.classifyDropped + ctx.reduceDropped;
  pushArrangementDiagnostics(ctx, diagnostics);

  const reuse = buildPatternsAndSequences(packed.channels, options, diagnostics);
  const title = safeTitle(options, parsed, inputLabel);
  const annotation = options.annotate
    ? buildArrangementAnnotation({
        ctx,
        contributions: packed.contributions ?? [],
        drumHitsDropped: packed.drumHitsDropped ?? 0,
        timing: {
          policy: timing.policy,
          sourceBpm: timing.sourceBpm,
          writtenBpm: timing.writtenBpm,
          ticksPerBeat: options.ticksPerBeat,
          startBar: options.startBar,
          endBar: options.endBar,
          nudge: options.nudge,
          ignoredTempos: timing.ignoredTempos.length,
          ignoredTimeSignatures,
        },
      })
    : undefined;
  const source = emitBaxSource({ options, bpm: timing.writtenBpm, title, reuse, annotation });

  const notesImported = parsed.notes.length;
  const summary: ConversionSummary = {
    notesImported,
    notesQuantized: quantized.length,
    notesDropped,
    barsGenerated: reuse.barsGenerated,
    patternsReused: reuse.patternsReused,
    patternsEmitted: reuse.patterns.length,
    channelsPacked: packed.channels.length,
    bpm: Math.round(timing.writtenBpm),
    chip: options.chip,
    mappingStats: packed.mappingStats?.length ? packed.mappingStats : undefined,
  };

  diagnostics.push({
    level: 'info',
    code: 'summary',
    message:
      `Imported ${summary.notesImported} notes → ${summary.patternsEmitted} pats / ` +
      `${summary.channelsPacked} channels (dropped ${summary.notesDropped})`,
  });

  if (options.strict) {
    const errors = diagnostics.filter((d) => d.level === 'error');
    if (errors.length > 0) {
      throw new Error(errors.map((e) => e.message).join('\n'));
    }
  }

  return { source, diagnostics, summary };
}

/**
 * Convert MIDI bytes to .bax source.
 * Pass `inputLabel` (e.g. filename) for song-name fallback metadata.
 */
export function convertMidiToBax(
  input: Uint8Array | ArrayBuffer,
  options: MidiConvertOptions,
  inputLabel?: string,
): MidiConvertResult {
  const parsed = readMidiBytes(input);
  return convertMidiParseResult(parsed, options, inputLabel);
}

/**
 * Convenience: merge CLI-style args + optional JSON config, then convert.
 */
export function convertMidiWithCliArgs(
  input: Uint8Array | ArrayBuffer,
  args: {
    chip: string;
    config?: MidiImportConfig | null;
    quantize?: string;
    grid?: string;
    maxOverlapTicks?: number;
    maxBars?: number;
    sectionBars?: number;
    strict?: boolean;
    title?: string;
    annotate?: boolean;
  },
  inputLabel?: string,
): MidiConvertResult {
  const options = resolveConvertOptions(args);
  return convertMidiToBax(input, options, inputLabel);
}
