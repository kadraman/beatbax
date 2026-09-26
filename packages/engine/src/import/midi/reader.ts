/**
 * MIDI file reader adapter using @tonejs/midi.
 * Browser-safe: accepts bytes only (no Node `fs`). Callers that have a path
 * should read the file themselves and pass the buffer to `readMidiBytes`.
 */
import * as ToneMidi from '@tonejs/midi';
import type { MidiParseResult, MidiRawNote, MidiTempoEvent, MidiTimeSigEvent } from './types.js';

/** Resolve Midi constructor across CJS/ESM interop shapes (Jest + Node ESM). */
function resolveMidiCtor(): new (data?: ArrayBuffer | ArrayLike<number>) => any {
  const mod: any = ToneMidi;
  const ctor = mod.Midi ?? mod.default?.Midi ?? mod.default;
  if (typeof ctor !== 'function') {
    throw new Error('Failed to load @tonejs/midi Midi constructor');
  }
  return ctor;
}

const Midi = resolveMidiCtor();

function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  // Node Buffer is a Uint8Array subclass and is accepted structurally here.
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

/** GM channel 10 is MIDI channel index 9 (0-based). */
export function isDrumChannel(midiChannel: number): boolean {
  return midiChannel === 9;
}

/**
 * Prefer the note-on event channel (format 0 multi-channel tracks) and fall back
 * to `track.channel` when the note does not carry one (typical @tonejs/midi shape).
 */
export function resolveNoteMidiChannel(
  note: { channel?: number },
  trackChannel: number,
): number {
  return typeof note.channel === 'number' ? note.channel : trackChannel;
}

export function readMidiBytes(bytes: Uint8Array | ArrayBuffer): MidiParseResult {
  const midi = new Midi(toArrayBuffer(bytes));
  const ppq = midi.header.ppq || 480;

  const tempos: MidiTempoEvent[] = (midi.header.tempos ?? []).map((t: { ticks?: number; bpm?: number }) => ({
    midiTicks: Math.round(t.ticks ?? 0),
    bpm: typeof t.bpm === 'number' && t.bpm > 0 ? t.bpm : 120,
  }));
  if (tempos.length === 0) {
    tempos.push({ midiTicks: 0, bpm: 120 });
  }

  const timeSignatures: MidiTimeSigEvent[] = (midi.header.timeSignatures ?? []).map(
    (ts: { ticks?: number; timeSignature?: number[] }) => {
      const arr = ts.timeSignature ?? [4, 4];
      return {
        midiTicks: Math.round(ts.ticks ?? 0),
        numerator: arr[0] ?? 4,
        denominator: arr[1] ?? 4,
      };
    },
  );

  const notes: MidiRawNote[] = [];
  let formatHint: MidiParseResult['formatHint'] = 'unknown';
  if (midi.tracks.length === 1) formatHint = '0';
  else if (midi.tracks.length > 1) formatHint = '1';

  midi.tracks.forEach((track: any, sourceTrackIndex: number) => {
    const program = track.instrument?.number ?? 0;
    const trackName = track.name || `track${sourceTrackIndex}`;
    const trackChannel = typeof track.channel === 'number' ? track.channel : 0;

    track.notes.forEach((note: any, sourceEventIndex: number) => {
      const midiChannel = resolveNoteMidiChannel(note, trackChannel);
      notes.push({
        startMidiTicks: Math.round(note.ticks),
        durationMidiTicks: Math.max(1, Math.round(note.durationTicks)),
        pitch: note.midi,
        velocity: Math.round((note.velocity ?? 0.8) * 127),
        midiChannel,
        sourceTrackIndex,
        sourceEventIndex,
        trackName,
        program,
        isDrum: isDrumChannel(midiChannel),
      });
    });
  });

  // Deterministic ordering before quantization.
  notes.sort((a, b) => {
    if (a.startMidiTicks !== b.startMidiTicks) return a.startMidiTicks - b.startMidiTicks;
    if (a.pitch !== b.pitch) return a.pitch - b.pitch;
    if (a.sourceTrackIndex !== b.sourceTrackIndex) return a.sourceTrackIndex - b.sourceTrackIndex;
    return a.sourceEventIndex - b.sourceEventIndex;
  });

  return {
    ppq,
    name: midi.name || '',
    formatHint,
    notes,
    tempos,
    timeSignatures,
    trackCount: midi.tracks.length,
  };
}
