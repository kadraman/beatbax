/**
 * Role classifier: auto-map MIDI tracks/channels to chip roles + optional config override.
 */
import { midiToNote } from '../../util/music.js';
import type { ChipRole } from './types.js';
import type {
  ClassifiedStream,
  ConversionDiagnostic,
  MidiConvertOptions,
  QuantizedNote,
  TrackMapping,
} from './types.js';

/** Invert of midiExport NOISE_TO_DRUM (full token names). */
export const DEFAULT_DRUM_MAP: Record<number, string> = {
  35: 'kick',
  36: 'kick',
  38: 'snare',
  40: 'snare',
  42: 'hihat',
  44: 'hihat',
  46: 'hihat',
};

export function mapDrumPitch(pitch: number, custom?: Record<string, string>): string {
  if (custom && custom[String(pitch)]) return custom[String(pitch)];
  return DEFAULT_DRUM_MAP[pitch] ?? 'hihat';
}

function trackNameHints(name: string): ChipRole | null {
  const n = name.toLowerCase();
  if (/\b(drum|perc|kit|noise)\b/.test(n)) return 'noise';
  if (/\b(bass|sub)\b/.test(n)) return 'wave';
  if (/\b(lead|melody|square|pulse1)\b/.test(n)) return 'pulse1';
  if (/\b(harm|arp|pad|pulse2)\b/.test(n)) return 'pulse2';
  if (/\b(tri|triangle)\b/.test(n)) return 'triangle';
  if (/\b(dmc|sample)\b/.test(n)) return 'dmc';
  return null;
}

/** GM program → role heuristic. */
function programHints(program: number): ChipRole | null {
  // Bass family 32–39
  if (program >= 32 && program <= 39) return 'wave';
  // Lead 80–87
  if (program >= 80 && program <= 87) return 'pulse1';
  // Synth pad / FX often harmony
  if (program >= 88 && program <= 103) return 'pulse2';
  // Guitar / piano → lead
  if (program <= 31) return 'pulse1';
  return null;
}

function pitchRangeHint(notes: QuantizedNote[]): ChipRole | null {
  if (notes.length === 0) return null;
  const avg = notes.reduce((s, n) => s + n.pitch, 0) / notes.length;
  if (avg < 48) return 'wave'; // below C3 → bass
  if (avg > 72) return 'pulse1'; // above C5 → lead
  return 'pulse2';
}

function roleForChip(role: ChipRole, chip: MidiConvertOptions['chip']): ChipRole {
  if (chip === 'gameboy' && role === 'triangle') return 'wave';
  if (chip === 'nes' && role === 'wave') return 'triangle';
  return role;
}

function instrumentForRole(role: ChipRole, chip: MidiConvertOptions['chip']): string {
  const r = roleForChip(role, chip);
  switch (r) {
    case 'pulse1':
      return 'lead';
    case 'pulse2':
      return 'arp';
    case 'wave':
    case 'triangle':
      return 'bass';
    case 'noise':
      return 'hihat';
    case 'dmc':
      return 'kick';
    default:
      return 'lead';
  }
}

function priorityForRole(role: ChipRole): number {
  switch (role) {
    case 'pulse1':
      return 100;
    case 'triangle':
    case 'wave':
      return 90;
    case 'pulse2':
      return 80;
    case 'dmc':
      return 60;
    case 'noise':
      return 50;
    default:
      return 40;
  }
}

function findOverride(
  note: QuantizedNote,
  mappings: TrackMapping[] | undefined,
): TrackMapping | undefined {
  if (!mappings || mappings.length === 0) return undefined;
  // Prefer explicit track+channel, then track, then channel.
  const scored = mappings
    .map((m) => {
      let score = 0;
      if (m.midiTrack != null && m.midiTrack === note.sourceTrackIndex) score += 2;
      if (m.midiChannel != null && m.midiChannel === note.midiChannel + 1) score += 2; // config uses 1-based
      if (m.midiChannel != null && m.midiChannel === note.midiChannel) score += 1; // also allow 0-based
      if (m.midiTrack == null && m.midiChannel == null) score = 0;
      // If only one dimension specified, require match
      if (m.midiTrack != null && m.midiTrack !== note.sourceTrackIndex) return { m, score: -1 };
      if (m.midiChannel != null) {
        const ch = m.midiChannel;
        if (ch !== note.midiChannel && ch !== note.midiChannel + 1) return { m, score: -1 };
      }
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.m;
}

/**
 * Group quantized notes into classified streams (one per track/channel or override target).
 */
export function classifyStreams(
  notes: QuantizedNote[],
  options: MidiConvertOptions,
  diagnostics: ConversionDiagnostic[],
): ClassifiedStream[] {
  const buckets = new Map<string, ClassifiedStream>();

  for (const note of notes) {
    const override = findOverride(note, options.trackMappings);
    let role: ChipRole;
    let instrument: string;
    let isDrum = note.isDrum;

    if (override) {
      role = roleForChip(override.target, options.chip);
      instrument = override.instrument ?? instrumentForRole(role, options.chip);
      if (role === 'noise' || role === 'dmc') isDrum = true;
    } else if (note.isDrum) {
      role = 'noise';
      instrument = mapDrumPitch(note.pitch);
      isDrum = true;
    } else {
      const hinted =
        trackNameHints(note.trackName) ??
        programHints(note.program) ??
        null;
      role = roleForChip(hinted ?? 'pulse1', options.chip);
      instrument = instrumentForRole(role, options.chip);
    }

    const key = override
      ? `ovr:${override.target}:${instrument}:${note.sourceTrackIndex}:${note.midiChannel}`
      : isDrum
        ? `drum:${note.sourceTrackIndex}:${note.midiChannel}`
        : `trk:${note.sourceTrackIndex}:${note.midiChannel}:${instrument}`;

    let stream = buckets.get(key);
    if (!stream) {
      stream = {
        id: key,
        roleHint: role,
        instrument,
        isDrum,
        notes: [],
        sourceTrackIndex: note.sourceTrackIndex,
        midiChannel: note.midiChannel,
        priority: priorityForRole(role),
      };
      buckets.set(key, stream);
    }
    stream.notes.push(note);
  }

  // Refine melodic roles using pitch-range when still on generic pulse1 from defaults
  for (const stream of buckets.values()) {
    if (stream.isDrum) continue;
    if (options.trackMappings && options.trackMappings.length > 0) continue;
    const fromName = trackNameHints(stream.notes[0]?.trackName ?? '');
    const fromProg = programHints(stream.notes[0]?.program ?? 0);
    if (!fromName && !fromProg) {
      const hint = pitchRangeHint(stream.notes);
      if (hint) {
        stream.roleHint = roleForChip(hint, options.chip);
        stream.instrument = instrumentForRole(stream.roleHint, options.chip);
        stream.priority = priorityForRole(stream.roleHint);
      }
    }
  }

  const streams = [...buckets.values()].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.sourceTrackIndex !== b.sourceTrackIndex) return a.sourceTrackIndex - b.sourceTrackIndex;
    return a.midiChannel - b.midiChannel;
  });

  diagnostics.push({
    level: 'info',
    code: 'streams_classified',
    message: `Classified ${streams.length} stream(s) from ${notes.length} note(s)`,
  });

  return streams;
}

export function noteTokenForHit(note: QuantizedNote, isDrum: boolean, drumMap?: Record<string, string>): string {
  if (isDrum) return mapDrumPitch(note.pitch, drumMap);
  return midiToNote(note.pitch);
}
