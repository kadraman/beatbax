/**
 * MIDI → .bax conversion orchestration (feature 006).
 * Browser-safe: accepts MIDI bytes only (no Node `fs` / `path`).
 */
import { resolveConvertOptions } from './config.js';
import { emitBaxSource } from './emit.js';
import { packChannels } from './pack.js';
import { quantizeNotes } from './quantize.js';
import { readMidiBytes } from './reader.js';
import { classifyStreams } from './roles.js';
import { buildPatternsAndSequences } from './reuse.js';
import type {
  ConversionDiagnostic,
  ConversionSummary,
  MidiConvertOptions,
  MidiConvertResult,
  MidiImportConfig,
  MidiParseResult,
} from './types.js';

export type { MidiConvertOptions, MidiConvertResult, MidiImportConfig, ConversionSummary, ConversionDiagnostic };
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
export { packChannels } from './pack.js';
export { buildPatternsAndSequences, compressPlaylist, hitsToBarTokens, hashTokens } from './reuse.js';
export { emitBaxSource } from './emit.js';

function fileBaseName(label: string): string {
  const normalized = label.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || label;
}

function pickBpm(parsed: MidiParseResult): number {
  const t0 = parsed.tempos.find((t) => t.midiTicks === 0) ?? parsed.tempos[0];
  return t0?.bpm && t0.bpm > 0 ? t0.bpm : 120;
}

/**
 * v1 emits a single `bpm` and fixed `patternTicks` bars. Warn when the MIDI
 * tempo map or time-signature map cannot be represented in that model.
 */
function pushIgnoredTimingDiagnostics(
  parsed: MidiParseResult,
  selectedBpm: number,
  patternTicks: number,
  diagnostics: ConversionDiagnostic[],
): void {
  const selectedTempo = parsed.tempos.find((t) => t.midiTicks === 0) ?? parsed.tempos[0];
  const ignoredTempos = selectedTempo
    ? parsed.tempos.filter((t) => t !== selectedTempo)
    : parsed.tempos;
  if (ignoredTempos.length > 0) {
    const changes = ignoredTempos
      .map((t) => `t=${t.midiTicks} bpm=${Math.round(t.bpm)}`)
      .join(', ');
    diagnostics.push({
      level: 'warn',
      code: 'tempo_map_ignored',
      message:
        `Ignoring ${ignoredTempos.length} MIDI tempo change(s) after initial bpm ${Math.round(selectedBpm)} ` +
        `(${changes}); output uses constant tempo`,
    });
  }

  const sigs = parsed.timeSignatures;
  if (sigs.length === 0) return;

  const incompatible = sigs.filter(
    (ts) => ts.numerator !== 4 || ts.denominator !== 4 || ts.midiTicks !== 0,
  );
  // Multiple events even if all 4/4 still cannot drive mid-song meter changes.
  const hasMapChanges = sigs.length > 1;
  if (incompatible.length === 0 && !hasMapChanges) return;

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
  options: MidiConvertOptions,
  inputLabel?: string,
): MidiConvertResult {
  const diagnostics: ConversionDiagnostic[] = [];

  if (parsed.notes.length === 0) {
    diagnostics.push({
      level: 'warn',
      code: 'empty_midi',
      message: 'MIDI file contains no note events',
    });
  }

  const bpm = pickBpm(parsed);
  pushIgnoredTimingDiagnostics(parsed, bpm, options.patternTicks, diagnostics);

  const quantized = quantizeNotes(parsed.notes, parsed.ppq, options, diagnostics);
  const streams = classifyStreams(quantized, options, diagnostics);
  const { channels, notesDropped } = packChannels(streams, options, diagnostics);
  const reuse = buildPatternsAndSequences(channels, options, diagnostics);
  const title = safeTitle(options, parsed, inputLabel);
  const source = emitBaxSource({ options, bpm, title, reuse });

  const notesImported = parsed.notes.length;
  const summary: ConversionSummary = {
    notesImported,
    notesQuantized: quantized.length,
    notesDropped,
    barsGenerated: reuse.barsGenerated,
    patternsReused: reuse.patternsReused,
    patternsEmitted: reuse.patterns.length,
    channelsPacked: channels.length,
    bpm: Math.round(bpm),
    chip: options.chip,
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
    strict?: boolean;
    title?: string;
  },
  inputLabel?: string,
): MidiConvertResult {
  const options = resolveConvertOptions(args);
  return convertMidiToBax(input, options, inputLabel);
}
