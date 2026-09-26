/**
 * Role classifier: auto-map MIDI tracks/channels to chip roles + optional config override.
 */
import { midiToNote } from '../../util/music.js';
import { gmFamilyFromProgram, instrumentNameForFamilyRole, DMC_KICK, DMC_SNARE } from './kit.js';
import type { ChipRole, GmFamily } from './types.js';
import type {
  ClassifiedStream,
  ConversionDiagnostic,
  MidiConvertOptions,
  QuantizedNote,
  TrackMapping,
} from './types.js';

/** Invert of midiExport NOISE_TO_DRUM (GM drum key → BeatBax token). */
export const DEFAULT_DRUM_MAP: Record<number, string> = {
  35: 'kick',
  36: 'kick',
  37: 'ghost', // side stick — soft ghost hits (must not become full snare)
  38: 'snare',
  39: 'snare', // hand clap → backbeat snare (export uses 39 as unnamed noise default)
  40: 'snare',
  42: 'hihat',
  44: 'hihat',
  46: 'hihat',
  49: 'crash',
};

export function mapDrumPitch(pitch: number, custom?: Record<string, string>): string {
  if (custom && custom[String(pitch)]) return custom[String(pitch)];
  return DEFAULT_DRUM_MAP[pitch] ?? 'hihat';
}

/**
 * Track-name → chip role. Prefer chiptune / producer labels (BeatBax audience),
 * then common orchestral names for classical stretch MIDIs.
 */
export function hintChipRoleFromTrackName(name: string): ChipRole | null {
  const n = name.toLowerCase();

  // Drums / percussion (ch.10 often already flagged; names still help)
  if (/\b(drum|drums|perc|percussion|kit|noise)\b/.test(n)) return 'noise';
  if (/\b(kick|snare|clap|claps|hat|hats|hihat|hi-hat|cymbal|tom|rim)\b/.test(n)) return 'noise';

  // Bass / low end
  if (/\b(bassline|bass\s*line|sub|subbass|reese|808)\b/.test(n)) return 'wave';
  if (/\b(bass)\b/.test(n)) return 'wave';

  // Lead / melody
  if (/\b(lead|melody|mel|solo|hook|vox|vocal)\b/.test(n)) return 'pulse1';
  if (/\b(saw|square|pulse1|chip\s*lead|synth\s*lead)\b/.test(n)) return 'pulse1';

  // Harmony / pad / arp
  if (/\b(arp|arpeggio|pluck|plucks)\b/.test(n)) return 'pulse2';
  if (/\b(pad|pads|chord|chords|harmony|harm|comp|keys|atmosphere|atmos|fx|riser)\b/.test(n)) {
    return 'pulse2';
  }
  if (/\b(pulse2|synth\s*pad)\b/.test(n)) return 'pulse2';

  // NES triangle callouts
  if (/\b(tri|triangle)\b/.test(n)) return 'triangle';
  if (/\b(dmc|sample|samples)\b/.test(n)) return 'dmc';

  // Orchestral stretch MIDIs (secondary — classical Mutopia etc.)
  if (/\b(cello|violoncello|contrabass|double\s*bass)\b/.test(n)) return 'wave';
  if (/\bviola\b/.test(n)) return 'pulse2';
  if (/violin\s*iii/.test(n)) return 'pulse1';
  if (/violin\s*ii/.test(n)) return 'pulse2';
  if (/violin/.test(n)) return 'pulse1';

  return null;
}

/** GM program → role heuristic. */
function programHints(program: number): ChipRole | null {
  // Bass family 32–39
  if (program >= 32 && program <= 39) return 'wave';
  // Orchestral strings (GM): violin→pulse1, viola→pulse2, cello/contrabass→bass
  if (program === 40) return 'pulse1'; // Violin
  if (program === 41) return 'pulse2'; // Viola
  if (program === 42 || program === 43) return 'wave'; // Cello / Contrabass
  // Other string-ish / ensemble (excl. 47 Timpani) → melodic pulse
  if ((program >= 44 && program <= 46) || (program >= 48 && program <= 51)) return 'pulse1';
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

function familyForNotes(notes: QuantizedNote[], options: MidiConvertOptions): GmFamily {
  return gmFamilyFromProgram(notes[0]?.program ?? 0, options.programFamilyByProgram);
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
    let gmFamily: GmFamily | undefined;
    let instrumentLocked = false;
    let drumMap: ClassifiedStream['drumMap'];

    if (override) {
      role = roleForChip(override.target, options.chip);
      gmFamily = note.isDrum ? undefined : gmFamilyFromProgram(note.program, options.programFamilyByProgram);
      drumMap = override.drumMap;
      if (override.instrument) {
        instrument = override.instrument;
        instrumentLocked = true;
      } else if (role === 'noise' || role === 'dmc') {
        instrument = role === 'dmc' ? DMC_KICK : 'hihat';
      } else {
        instrument = instrumentNameForFamilyRole(gmFamily ?? 'lead', role);
      }
      if (role === 'noise' || role === 'dmc') isDrum = true;
    } else if (note.isDrum) {
      role = 'noise';
      instrument = mapDrumPitch(note.pitch);
      isDrum = true;
    } else {
      const hinted =
        hintChipRoleFromTrackName(note.trackName) ??
        programHints(note.program) ??
        null;
      role = roleForChip(hinted ?? 'pulse1', options.chip);
      gmFamily = gmFamilyFromProgram(note.program, options.programFamilyByProgram);
      instrument = instrumentNameForFamilyRole(gmFamily, role);
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
        gmFamily,
        instrumentLocked,
        mappingOverride: override != null,
        isDrum,
        drumMap,
        notes: [],
        sourceTrackIndex: note.sourceTrackIndex,
        midiChannel: note.midiChannel,
        priority: priorityForRole(role),
      };
      buckets.set(key, stream);
    }
    stream.notes.push(note);
  }

  // Refine melodic roles using pitch-range when still on generic pulse1 from defaults.
  // Only skip streams that matched a trackMappings override — partial configs must not
  // disable refinement for unrelated auto-mapped tracks.
  for (const stream of buckets.values()) {
    if (stream.isDrum || stream.mappingOverride) continue;
    const fromName = hintChipRoleFromTrackName(stream.notes[0]?.trackName ?? '');
    const fromProg = programHints(stream.notes[0]?.program ?? 0);
    if (!fromName && !fromProg) {
      const hint = pitchRangeHint(stream.notes);
      if (hint) {
        stream.roleHint = roleForChip(hint, options.chip);
        stream.gmFamily = familyForNotes(stream.notes, options);
        if (!stream.instrumentLocked) {
          stream.instrument = instrumentNameForFamilyRole(stream.gmFamily, stream.roleHint);
        }
        stream.priority = priorityForRole(stream.roleHint);
      }
    } else if (!stream.instrumentLocked && stream.gmFamily) {
      stream.instrument = instrumentNameForFamilyRole(stream.gmFamily, stream.roleHint);
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

/** Map a drum note to the NES DMC reinforcement token (`kick_dmc` / `snare_dmc`). */
export function dmcTokenForHit(note: QuantizedNote, drumMap?: Record<string, string>): string {
  const base = mapDrumPitch(note.pitch, drumMap);
  if (base === 'snare') return DMC_SNARE;
  return DMC_KICK;
}
