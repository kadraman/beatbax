/**
 * Role classifier: auto-map MIDI tracks/channels to chip roles + optional config override.
 */
import { midiToNote } from '../../util/music.js';
import { gmFamilyFromProgram, instrumentNameForFamilyRole, DMC_KICK, DMC_SNARE } from './kit.js';
import { createArrangementContext, statsFor, type ArrangementContext } from './arrangement.js';
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

/** 006 selector score: > 0 when the mapping's track/channel selector matches the note. */
function selectorScore(note: QuantizedNote, m: TrackMapping): number {
  // Prefer explicit track+channel, then track, then channel.
  let score = 0;
  if (m.midiTrack != null && m.midiTrack === note.sourceTrackIndex) score += 2;
  if (m.midiChannel != null && m.midiChannel === note.midiChannel + 1) score += 2; // config uses 1-based
  if (m.midiChannel != null && m.midiChannel === note.midiChannel) score += 1; // also allow 0-based
  if (m.midiTrack == null && m.midiChannel == null) score = 0;
  // If only one dimension specified, require match
  if (m.midiTrack != null && m.midiTrack !== note.sourceTrackIndex) return -1;
  if (m.midiChannel != null) {
    const ch = m.midiChannel;
    if (ch !== note.midiChannel && ch !== note.midiChannel + 1) return -1;
  }
  return score;
}

export interface MappingMatch {
  mapping: TrackMapping;
  index: number;
  score: number;
}

function isDrumTarget(role: ChipRole): boolean {
  return role === 'noise' || role === 'dmc';
}

/** True when the mapping uses any feature-089 field. */
export function usesArrangementFields(m: TrackMapping): boolean {
  return (
    m.fromBar != null ||
    m.toBar != null ||
    m.mono != null ||
    m.transpose != null ||
    m.fold != null ||
    m.include != null ||
    m.exclude != null
  );
}

function inBarRange(note: QuantizedNote, m: TrackMapping, ctx: ArrangementContext): boolean {
  if (m.fromBar != null && note.startTick < ctx.barStartTick(m.fromBar)) return false;
  if (m.toBar != null && note.startTick >= ctx.barStartTick(m.toBar + 1)) return false;
  return true;
}

function passesDrumFilter(pitch: number, m: TrackMapping): boolean {
  if (m.include && !m.include.includes(pitch)) return false;
  if (m.exclude && m.exclude.includes(pitch)) return false;
  return true;
}

/**
 * Every mapping whose selector and bar range match the note, in config order
 * (spec FR-010, FR-014). Include/exclude filtering is applied by the caller.
 */
export function findOverrides(
  note: QuantizedNote,
  mappings: TrackMapping[] | undefined,
  ctx: ArrangementContext,
): MappingMatch[] {
  if (!mappings || mappings.length === 0) return [];
  const out: MappingMatch[] = [];
  mappings.forEach((mapping, index) => {
    const score = selectorScore(note, mapping);
    if (score > 0 && inBarRange(note, mapping, ctx)) out.push({ mapping, index, score });
  });
  return out;
}

/** 006 choice: highest score, first in config order on ties. */
function bestMatch(matches: MappingMatch[]): MappingMatch | undefined {
  let best: MappingMatch | undefined;
  for (const m of matches) if (!best || m.score > best.score) best = m;
  return best;
}

/** Everything about a mapping except its track/channel selector. */
function mappingSignature(m: TrackMapping): string {
  return JSON.stringify([
    m.target,
    m.instrument ?? null,
    m.fromBar ?? null,
    m.toBar ?? null,
    m.mono ?? null,
    m.transpose ?? null,
    m.fold ?? null,
    m.include ?? null,
    m.exclude ?? null,
    m.drumMap ?? null,
  ]);
}

/**
 * Lane mode: keep every match, except that mappings differing only in selector
 * specificity keep the most specific one, and each drum target gets at most one mapping.
 */
function laneMatches(matches: MappingMatch[]): MappingMatch[] {
  const bySignature = new Map<string, MappingMatch>();
  const drumByTarget = new Map<ChipRole, MappingMatch>();
  for (const m of matches) {
    if (isDrumTarget(m.mapping.target)) {
      const prev = drumByTarget.get(m.mapping.target);
      if (!prev || m.score > prev.score) drumByTarget.set(m.mapping.target, m);
      continue;
    }
    const sig = mappingSignature(m.mapping);
    const prev = bySignature.get(sig);
    if (!prev || m.score > prev.score) bySignature.set(sig, m);
  }
  return [...bySignature.values(), ...drumByTarget.values()].sort((a, b) => a.index - b.index);
}

/** Transpose then fold (spec FR-022); `null` when the pitch leaves MIDI 0–127. */
export function adjustPitch(pitch: number, m: Pick<TrackMapping, 'transpose' | 'fold'>): number | null {
  let p = pitch + (m.transpose ?? 0);
  if (m.fold) {
    const [lo, hi] = m.fold;
    while (p < lo) p += 12;
    while (p > hi) p -= 12;
  }
  if (p < 0 || p > 127) return null;
  return p;
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
  ctx: ArrangementContext = createArrangementContext(options),
): ClassifiedStream[] {
  const buckets = new Map<string, ClassifiedStream>();
  const lanes = options.packing === 'lanes';

  const addNote = (key: string, note: QuantizedNote, init: () => ClassifiedStream) => {
    let stream = buckets.get(key);
    if (!stream) {
      stream = init();
      buckets.set(key, stream);
    }
    stream.notes.push(note);
  };

  const addMapped = (note: QuantizedNote, match: MappingMatch) => {
    const m = match.mapping;
    const stats = statsFor(ctx, match.index, m);
    const role = roleForChip(m.target, options.chip);
    const drumTarget = role === 'noise' || role === 'dmc';

    let n = note;
    if (!drumTarget && (m.transpose != null || m.fold != null)) {
      const pitch = adjustPitch(note.pitch, m);
      if (pitch == null) {
        stats.pitchOutOfRange += 1;
        ctx.classifyDropped += 1;
        return;
      }
      if (pitch !== note.pitch) n = { ...n, pitch };
    }
    if (m.toBar != null) {
      const end = ctx.barStartTick(m.toBar + 1);
      if (n.startTick + n.durationTicks > end) n = { ...n, durationTicks: Math.max(1, end - n.startTick) };
    }
    stats.matched += 1;

    const gmFamily = note.isDrum ? undefined : gmFamilyFromProgram(note.program, options.programFamilyByProgram);
    let instrument: string;
    let instrumentLocked = false;
    if (m.instrument) {
      instrument = m.instrument;
      instrumentLocked = true;
    } else if (drumTarget) {
      instrument = role === 'dmc' ? DMC_KICK : 'hihat';
    } else {
      instrument = instrumentNameForFamilyRole(gmFamily ?? 'lead', role);
    }
    const isDrum = drumTarget || note.isDrum;
    const lane = lanes && !isDrum;
    if (!isDrum) stats.instrument = instrument;
    else if (!stats.instrument) stats.instrument = drumTarget ? role : instrument;

    const key = lane
      ? `lane:${m.target}:${match.index}`
      : `ovr:${m.target}:${instrument}:${note.sourceTrackIndex}:${note.midiChannel}` +
        (usesArrangementFields(m) ? `:m${match.index}` : '');

    addNote(key, n, () => ({
      id: key,
      roleHint: role,
      instrument,
      gmFamily,
      instrumentLocked,
      mappingOverride: true,
      isDrum,
      drumMap: m.drumMap,
      notes: [],
      sourceTrackIndex: note.sourceTrackIndex,
      midiChannel: note.midiChannel,
      priority: priorityForRole(role),
      mappingIndex: match.index,
      lane,
      mono: lane ? (m.mono ?? 'earliest') : isDrum ? undefined : m.mono,
    }));
  };

  for (const note of notes) {
    const accepted: MappingMatch[] = [];
    let filtered = false;
    for (const match of findOverrides(note, options.trackMappings, ctx)) {
      if (isDrumTarget(match.mapping.target) && !passesDrumFilter(note.pitch, match.mapping)) {
        statsFor(ctx, match.index, match.mapping).filtered += 1;
        filtered = true;
        continue;
      }
      accepted.push(match);
    }

    const chosen = lanes ? laneMatches(accepted) : [bestMatch(accepted)].filter((m): m is MappingMatch => !!m);
    if (chosen.length > 0) {
      for (const match of chosen) addMapped(note, match);
      continue;
    }
    // Ignored by every matching mapping's include/exclude.
    if (filtered) continue;
    if (options.unmappedTracks === 'drop') {
      const label = `T${note.sourceTrackIndex} ch${note.midiChannel + 1}`;
      ctx.unmappedDropped.set(label, (ctx.unmappedDropped.get(label) ?? 0) + 1);
      continue;
    }

    let role: ChipRole;
    let instrument: string;
    let isDrum = note.isDrum;
    let gmFamily: GmFamily | undefined;
    if (note.isDrum) {
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

    const key = isDrum
      ? `drum:${note.sourceTrackIndex}:${note.midiChannel}`
      : `trk:${note.sourceTrackIndex}:${note.midiChannel}:${instrument}`;

    addNote(key, note, () => ({
      id: key,
      roleHint: role,
      instrument,
      gmFamily,
      instrumentLocked: false,
      mappingOverride: false,
      isDrum,
      drumMap: undefined,
      notes: [],
      sourceTrackIndex: note.sourceTrackIndex,
      midiChannel: note.midiChannel,
      priority: priorityForRole(role),
    }));
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
