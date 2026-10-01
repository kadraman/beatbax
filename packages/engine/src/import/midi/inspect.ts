/**
 * Structured MIDI inspection report (feature 089, spec FR-050 / FR-051).
 * Browser-safe and deterministic; the CLI formats it.
 */
import { midiToNote } from '../../util/music.js';
import { readMidiBytes } from './reader.js';
import {
  lastNoteEndMidiTicks,
  longestTempo,
  firstTempo,
  sourceBarAt,
  sourceBarMidiTicks,
} from './timing.js';
import type { MidiParseResult, MidiRawNote } from './types.js';

/** Bars per activity block in the per-track activity map. */
export const INSPECT_ACTIVITY_BLOCK_BARS = 8;

export interface MidiInspectTrack {
  /** `T<n>`, or `T<n>/ch<c>` when a track uses more than one MIDI channel. */
  id: string;
  index: number;
  /** MIDI channel, 1-based. */
  channel: number;
  program: number;
  programName: string;
  name: string;
  notes: number;
  lowPitch: number;
  highPitch: number;
  lowNote: string;
  highNote: string;
  firstBar: number;
  lastBar: number;
  /** Note starts per block of `INSPECT_ACTIVITY_BLOCK_BARS` source bars. */
  activity: number[];
  /** Id of the first earlier entry with an identical note list. */
  duplicateOf?: string;
}

export interface MidiInspectReport {
  ppq: number;
  name: string;
  formatHint: MidiParseResult['formatHint'];
  trackCount: number;
  /** Source bars spanned by the notes, measured with the first time signature. */
  bars: number;
  timeSignatures: { bar: number; midiTicks: number; numerator: number; denominator: number }[];
  tempos: { bar: number; midiTicks: number; bpm: number }[];
  firstBpm: number;
  longestBpm: number;
  activityBlockBars: number;
  tracks: MidiInspectTrack[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function noteSignature(notes: MidiRawNote[]): string {
  return [...notes]
    .sort(
      (a, b) =>
        a.startMidiTicks - b.startMidiTicks ||
        a.pitch - b.pitch ||
        a.durationMidiTicks - b.durationMidiTicks,
    )
    .map((n) => `${n.startMidiTicks}:${n.pitch}:${n.durationMidiTicks}`)
    .join(',');
}

export function inspectMidiParseResult(parsed: MidiParseResult): MidiInspectReport {
  const barTicks = sourceBarMidiTicks(parsed);
  const bars = Math.max(1, Math.ceil(lastNoteEndMidiTicks(parsed.notes) / barTicks));
  const blocks = Math.max(1, Math.ceil(bars / INSPECT_ACTIVITY_BLOCK_BARS));

  const groups = new Map<number, Map<number, MidiRawNote[]>>();
  for (const n of parsed.notes) {
    const byChannel = groups.get(n.sourceTrackIndex) ?? new Map<number, MidiRawNote[]>();
    const list = byChannel.get(n.midiChannel) ?? [];
    list.push(n);
    byChannel.set(n.midiChannel, list);
    groups.set(n.sourceTrackIndex, byChannel);
  }

  const trackInfo = new Map((parsed.tracks ?? []).map((t) => [t.index, t]));
  const tracks: MidiInspectTrack[] = [];
  const signatures: { id: string; sig: string }[] = [];

  for (const index of [...groups.keys()].sort((a, b) => a - b)) {
    const byChannel = groups.get(index)!;
    const channels = [...byChannel.keys()].sort((a, b) => a - b);
    for (const channel of channels) {
      const notes = byChannel.get(channel)!;
      const id = channels.length > 1 ? `T${index}/ch${channel + 1}` : `T${index}`;
      let lo = 127;
      let hi = 0;
      let firstStart = Number.POSITIVE_INFINITY;
      let lastStart = 0;
      const activity = new Array<number>(blocks).fill(0);
      for (const n of notes) {
        lo = Math.min(lo, n.pitch);
        hi = Math.max(hi, n.pitch);
        firstStart = Math.min(firstStart, n.startMidiTicks);
        lastStart = Math.max(lastStart, n.startMidiTicks);
        const block = Math.floor((sourceBarAt(n.startMidiTicks, barTicks) - 1) / INSPECT_ACTIVITY_BLOCK_BARS);
        activity[Math.min(block, blocks - 1)]! += 1;
      }
      const sig = noteSignature(notes);
      const dup = signatures.find((s) => s.sig === sig);
      signatures.push({ id, sig });
      const info = trackInfo.get(index);
      tracks.push({
        id,
        index,
        channel: channel + 1,
        program: notes[0]!.program,
        programName: info?.programName ?? '',
        name: notes[0]!.trackName,
        notes: notes.length,
        lowPitch: lo,
        highPitch: hi,
        lowNote: midiToNote(lo),
        highNote: midiToNote(hi),
        firstBar: sourceBarAt(firstStart, barTicks),
        lastBar: sourceBarAt(lastStart, barTicks),
        activity,
        ...(dup ? { duplicateOf: dup.id } : {}),
      });
    }
  }

  const sortedTempos = [...parsed.tempos].sort((a, b) => a.midiTicks - b.midiTicks);
  const sortedSigs = [...parsed.timeSignatures].sort((a, b) => a.midiTicks - b.midiTicks);
  const first = firstTempo(parsed);
  const longest = longestTempo(parsed);

  return {
    ppq: parsed.ppq,
    name: parsed.name,
    formatHint: parsed.formatHint,
    trackCount: parsed.trackCount,
    bars,
    timeSignatures: sortedSigs.map((ts) => ({
      bar: sourceBarAt(ts.midiTicks, barTicks),
      midiTicks: ts.midiTicks,
      numerator: ts.numerator,
      denominator: ts.denominator,
    })),
    tempos: sortedTempos.map((t) => ({
      bar: sourceBarAt(t.midiTicks, barTicks),
      midiTicks: t.midiTicks,
      bpm: round2(t.bpm),
    })),
    firstBpm: round2(first?.bpm && first.bpm > 0 ? first.bpm : 120),
    longestBpm: round2(longest?.bpm && longest.bpm > 0 ? longest.bpm : 120),
    activityBlockBars: INSPECT_ACTIVITY_BLOCK_BARS,
    tracks,
  };
}

export function inspectMidiBytes(bytes: Uint8Array | ArrayBuffer): MidiInspectReport {
  return inspectMidiParseResult(readMidiBytes(bytes));
}
