import { parse } from '../../../src/parser/index';
import { getSongValidationIssues } from '../../../src/chips/songValidation';
import {
  convertMidiParseResult,
  parseImportConfig,
  resolveConvertOptions,
} from '../../../src/import/midi';
import type {
  MidiConvertResult,
  MidiParseResult,
  MidiRawNote,
  MidiTempoEvent,
  MidiTimeSigEvent,
} from '../../../src/import/midi/types';

export const PPQ = 480;
/** One sixteenth at PPQ 480. */
export const S = 120;
/** One 4/4 bar at PPQ 480. */
export const BAR = 16 * S;

let eventCounter = 0;

/** Build a raw note; `start` and `dur` are in sixteenths. */
export function rawNote(
  track: number,
  pitch: number,
  start: number,
  dur: number,
  extra: Partial<MidiRawNote> = {},
): MidiRawNote {
  return {
    startMidiTicks: start * S,
    durationMidiTicks: dur * S,
    pitch,
    velocity: 100,
    midiChannel: track,
    sourceTrackIndex: track,
    sourceEventIndex: eventCounter++,
    trackName: `Track ${track}`,
    program: 81,
    isDrum: false,
    ...extra,
  };
}

export function parseResult(
  notes: MidiRawNote[],
  opts: { tempos?: MidiTempoEvent[]; timeSignatures?: MidiTimeSigEvent[] } = {},
): MidiParseResult {
  const sorted = [...notes].sort(
    (a, b) =>
      a.startMidiTicks - b.startMidiTicks ||
      a.pitch - b.pitch ||
      a.sourceTrackIndex - b.sourceTrackIndex ||
      a.sourceEventIndex - b.sourceEventIndex,
  );
  return {
    ppq: PPQ,
    name: 'test',
    formatHint: '1',
    notes: sorted,
    tempos: opts.tempos ?? [{ midiTicks: 0, bpm: 120 }],
    timeSignatures: opts.timeSignatures ?? [],
    trackCount: Math.max(0, ...notes.map((n) => n.sourceTrackIndex + 1)),
  };
}

export function convertWith(
  parsed: MidiParseResult,
  config: Record<string, unknown>,
  chip: 'gameboy' | 'nes' = 'gameboy',
  extra: { annotate?: boolean } = {},
): MidiConvertResult {
  const options = resolveConvertOptions({ chip, config: parseImportConfig(config), ...extra });
  return convertMidiParseResult(parsed, options, 'test.mid');
}

/** Parse the generated source and require no parse errors and no chip validation issues. */
export function expectVerifies(source: string): void {
  const ast = parse(source);
  expect(ast).toBeTruthy();
  expect(ast.channels?.length ?? 0).toBeGreaterThan(0);
  const errors = (ast.diagnostics ?? []).filter((d) => d.level === 'error');
  expect(errors).toEqual([]);
  expect(getSongValidationIssues(ast)).toEqual([]);
}

/** `pat` bodies from generated source, keyed by pattern name. */
export function patterns(source: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of source.split('\n')) {
    const m = /^pat (\S+) = (.*)$/.exec(line);
    if (m) out.set(m[1]!, m[2]!);
  }
  return out;
}

/** The channel's bar-by-bar pattern bodies (expands `name*N`). */
export function channelBars(source: string, channelIndex: number): string[] {
  const lines = source.split('\n');
  const chLine = lines.find((l) => l.startsWith(`channel ${channelIndex} =>`));
  if (!chLine) return [];
  const seqNames = chLine.replace(/^channel \d+ => inst \S+ seq /, '').trim().split(/\s+/);
  const seqs = new Map<string, string[]>();
  for (const l of lines) {
    const m = /^seq (\S+) = (.*)$/.exec(l);
    if (m) seqs.set(m[1]!, m[2]!.trim().split(/\s+/));
  }
  const pats = patterns(source);
  const bars: string[] = [];
  for (const seqName of seqNames) {
    for (const item of seqs.get(seqName) ?? []) {
      const [name, times] = item.split('*');
      for (let i = 0; i < Number(times ?? 1); i++) bars.push(pats.get(name!) ?? '');
    }
  }
  return bars;
}

export function codes(result: MidiConvertResult): string[] {
  return result.diagnostics.map((d) => d.code);
}
