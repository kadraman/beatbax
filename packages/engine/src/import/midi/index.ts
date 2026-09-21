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
  parseQuantizeMode,
  parseQuantizeGrid,
} from './config.js';
export { readMidiBytes } from './reader.js';
export { quantizeNotes, midiTicksToBaxTicks } from './quantize.js';
export { classifyStreams, mapDrumPitch, DEFAULT_DRUM_MAP } from './roles.js';
export { packChannels } from './pack.js';
export { emitKitLines } from './kit.js';
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

  const quantized = quantizeNotes(parsed.notes, parsed.ppq, options, diagnostics);
  const streams = classifyStreams(quantized, options, diagnostics);
  const { channels, notesDropped } = packChannels(streams, options, diagnostics);
  const reuse = buildPatternsAndSequences(channels, options, diagnostics);
  const bpm = pickBpm(parsed);
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
  input: Uint8Array | ArrayBuffer | Buffer,
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
  input: Uint8Array | ArrayBuffer | Buffer,
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
