/**
 * Source timing for MIDI import (feature 089): tempo selection, written bpm,
 * source bar grid, nudge and song window. Browser-safe.
 */
import { midiTicksToBaxTicks } from './quantize.js';
import type {
  ConversionDiagnostic,
  MidiConvertOptions,
  MidiParseResult,
  MidiRawNote,
  MidiTempoEvent,
  MidiTimeSigEvent,
  QuantizedNote,
  TempoPolicy,
} from './types.js';

export type TempoSelection = TempoPolicy | 'override';

export interface TimingPlan {
  /** Tempo of the source music (BPM). */
  sourceBpm: number;
  /** Tempo written to the `.bax` (`sourceBpm × ticksPerBeat / 4`, unrounded). */
  writtenBpm: number;
  policy: TempoSelection;
  /** Tempo events not represented by the constant output tempo. */
  ignoredTempos: MidiTempoEvent[];
  /** Source bar length in MIDI ticks (first time signature; 4/4 fallback). */
  barMidiTicks: number;
  /** Nudge in MIDI ticks (source sixteenths × ppq / 4). */
  nudgeMidiTicks: number;
  /** Absolute BeatBax tick of the window start (0 without `startBar`). */
  windowStartTick: number;
  /** Absolute BeatBax tick where the window ends (exclusive), when `endBar` is set. */
  windowEndTick?: number;
  /** Source bars spanned by the notes (at least 1). */
  songBars: number;
}

/** First time signature by position (4/4 when the file has none). */
export function firstTimeSignature(parsed: MidiParseResult): MidiTimeSigEvent {
  let first: MidiTimeSigEvent | undefined;
  for (const ts of parsed.timeSignatures) {
    if (!first || ts.midiTicks < first.midiTicks) first = ts;
  }
  return first ?? { midiTicks: 0, numerator: 4, denominator: 4 };
}

/** MIDI ticks per source bar, measured with the first time signature. */
export function sourceBarMidiTicks(parsed: MidiParseResult): number {
  const ts = firstTimeSignature(parsed);
  const num = ts.numerator > 0 ? ts.numerator : 4;
  const den = ts.denominator > 0 ? ts.denominator : 4;
  return (parsed.ppq * 4 * num) / den;
}

/** 1-based source bar containing `midiTicks`. */
export function sourceBarAt(midiTicks: number, barMidiTicks: number): number {
  if (barMidiTicks <= 0) return 1;
  return Math.floor(Math.max(0, midiTicks) / barMidiTicks) + 1;
}

export function lastNoteEndMidiTicks(notes: MidiRawNote[]): number {
  let end = 0;
  for (const n of notes) end = Math.max(end, n.startMidiTicks + n.durationMidiTicks);
  return end;
}

/** 006 rule: the tempo event at tick 0, else the first event, else 120. */
export function firstTempo(parsed: MidiParseResult): MidiTempoEvent | undefined {
  return parsed.tempos.find((t) => t.midiTicks === 0) ?? parsed.tempos[0];
}

/**
 * The tempo held for the most MIDI ticks up to the last note end
 * (grouped by rounded BPM; ties → lower BPM).
 */
export function longestTempo(parsed: MidiParseResult): MidiTempoEvent | undefined {
  const tempos = [...parsed.tempos].sort((a, b) => a.midiTicks - b.midiTicks);
  if (tempos.length === 0) return undefined;
  const songEnd = lastNoteEndMidiTicks(parsed.notes);
  if (songEnd <= 0) return firstTempo(parsed);

  const held = new Map<number, { ticks: number; event: MidiTempoEvent }>();
  for (let i = 0; i < tempos.length; i++) {
    const t = tempos[i]!;
    const start = i === 0 ? 0 : t.midiTicks;
    const end = Math.min(songEnd, i + 1 < tempos.length ? tempos[i + 1]!.midiTicks : songEnd);
    const ticks = Math.max(0, end - start);
    const key = Math.round(t.bpm);
    const entry = held.get(key);
    if (entry) entry.ticks += ticks;
    else held.set(key, { ticks, event: t });
  }

  let best: { key: number; ticks: number; event: MidiTempoEvent } | undefined;
  for (const [key, v] of held) {
    if (!best || v.ticks > best.ticks || (v.ticks === best.ticks && key < best.key)) {
      best = { key, ticks: v.ticks, event: v.event };
    }
  }
  return best?.event;
}

/** Written tempo so that `ticksPerBeat` output steps span one source beat. */
export function writtenBpm(sourceBpm: number, ticksPerBeat: number): number {
  return (sourceBpm * ticksPerBeat) / 4;
}

export function selectSourceTempo(
  parsed: MidiParseResult,
  options: Pick<MidiConvertOptions, 'bpm' | 'tempo'>,
): { bpm: number; policy: TempoSelection; ignored: MidiTempoEvent[] } {
  const first = firstTempo(parsed);
  const ignoredAfterFirst = first ? parsed.tempos.filter((t) => t !== first) : [...parsed.tempos];

  const otherThan = (bpm: number) => parsed.tempos.filter((t) => Math.round(t.bpm) !== Math.round(bpm));

  if (typeof options.bpm === 'number' && options.bpm > 0) {
    return { bpm: options.bpm, policy: 'override', ignored: otherThan(options.bpm) };
  }
  if (options.tempo === 'longest') {
    const chosen = longestTempo(parsed);
    const bpm = chosen?.bpm && chosen.bpm > 0 ? chosen.bpm : 120;
    return { bpm, policy: 'longest', ignored: otherThan(bpm) };
  }
  const bpm = first?.bpm && first.bpm > 0 ? first.bpm : 120;
  return { bpm, policy: 'first', ignored: ignoredAfterFirst };
}

/** True when the config uses any source bar number. */
export function usesBarNumbers(options: MidiConvertOptions): boolean {
  if (options.startBar != null || options.endBar != null) return true;
  return (options.trackMappings ?? []).some((m) => m.fromBar != null || m.toBar != null);
}

/** Absolute BeatBax tick where 1-based source `bar` starts. */
export function sourceBarStartBaxTick(bar: number, barMidiTicks: number, ppq: number, ticksPerBeat: number): number {
  return Math.round(midiTicksToBaxTicks((bar - 1) * barMidiTicks, ppq, ticksPerBeat));
}

export function resolveTiming(
  parsed: MidiParseResult,
  options: MidiConvertOptions,
  diagnostics: ConversionDiagnostic[],
): TimingPlan {
  const tempo = selectSourceTempo(parsed, options);
  const barMidiTicks = sourceBarMidiTicks(parsed);
  const songEnd = lastNoteEndMidiTicks(parsed.notes);
  const songBars = Math.max(1, Math.ceil(songEnd / barMidiTicks));

  if (usesBarNumbers(options)) {
    if (parsed.timeSignatures.length > 1) {
      const ts = firstTimeSignature(parsed);
      diagnostics.push({
        level: 'warn',
        code: 'bar_numbering_first_signature',
        message:
          `MIDI file has ${parsed.timeSignatures.length} time signature events; config bar numbers ` +
          `are measured with the first (${ts.numerator}/${ts.denominator})`,
      });
    }
    const outside: string[] = [];
    if (options.startBar != null && options.startBar > songBars) outside.push(`startBar ${options.startBar}`);
    (options.trackMappings ?? []).forEach((m, i) => {
      if (m.fromBar != null && m.fromBar > songBars) outside.push(`trackMappings[${i}].fromBar ${m.fromBar}`);
    });
    if (outside.length > 0) {
      diagnostics.push({
        level: 'warn',
        code: 'bar_range_outside_song',
        message: `${outside.join(', ')} beyond the last source bar (${songBars}); no notes selected`,
      });
    }
  }

  const barTick = (bar: number) => sourceBarStartBaxTick(bar, barMidiTicks, parsed.ppq, options.ticksPerBeat);

  return {
    sourceBpm: tempo.bpm,
    writtenBpm: writtenBpm(tempo.bpm, options.ticksPerBeat),
    policy: tempo.policy,
    ignoredTempos: tempo.ignored,
    barMidiTicks,
    nudgeMidiTicks: (options.nudge * parsed.ppq) / 4,
    windowStartTick: options.startBar != null ? barTick(options.startBar) : 0,
    windowEndTick: options.endBar != null ? barTick(options.endBar + 1) : undefined,
    songBars,
  };
}

/** Shift every note by `nudgeMidiTicks`; notes pushed before 0 start at 0. */
export function applyNudge(notes: MidiRawNote[], nudgeMidiTicks: number): MidiRawNote[] {
  if (nudgeMidiTicks === 0) return notes;
  return notes.map((n) => {
    const start = n.startMidiTicks + nudgeMidiTicks;
    const end = start + n.durationMidiTicks;
    const clampedStart = Math.max(0, start);
    return {
      ...n,
      startMidiTicks: clampedStart,
      durationMidiTicks: Math.max(1, end - clampedStart),
    };
  });
}

/**
 * Keep notes whose quantized start lies in the window, shorten notes that run
 * past its end, and shift so the window start becomes tick 0.
 */
export function applyWindow(notes: QuantizedNote[], timing: TimingPlan): QuantizedNote[] {
  const start = timing.windowStartTick;
  const end = timing.windowEndTick;
  if (start === 0 && end == null) return notes;
  const out: QuantizedNote[] = [];
  for (const n of notes) {
    if (n.startTick < start) continue;
    if (end != null && n.startTick >= end) continue;
    const noteEnd = n.startTick + n.durationTicks;
    const clippedEnd = end != null ? Math.min(noteEnd, end) : noteEnd;
    out.push({
      ...n,
      startTick: n.startTick - start,
      durationTicks: Math.max(1, clippedEnd - n.startTick),
    });
  }
  return out;
}
