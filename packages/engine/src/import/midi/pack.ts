/**
 * Channel packer: assign streams to chip roles, multiplex with inst(), drop over-polyphony.
 */
import { getChipRoleTable, type ChipRoleSlot } from './chipRoles.js';
import { instrumentNameForFamilyRole } from './kit.js';
import { mapDrumPitch, noteTokenForHit, dmcTokenForHit } from './roles.js';
import { DMC_KICK } from './kit.js';
import type {
  ClassifiedStream,
  ConversionDiagnostic,
  MidiConvertOptions,
  PackedChannel,
  PackedHit,
  QuantizedNote,
} from './types.js';

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number, slack: number): boolean {
  // Overlap amount in ticks; allow slack (maxOverlapTicks)
  const overlap = Math.min(a1, b1) - Math.max(a0, b0);
  return overlap > slack;
}

function streamOverlaps(a: QuantizedNote[], b: QuantizedNote[], maxOverlapTicks: number): boolean {
  // Sweep: check if any note pair overlaps beyond slack
  for (const na of a) {
    const a1 = na.startTick + na.durationTicks;
    for (const nb of b) {
      const b1 = nb.startTick + nb.durationTicks;
      if (intervalsOverlap(na.startTick, a1, nb.startTick, b1, maxOverlapTicks)) return true;
    }
  }
  return false;
}

function flattenChord(notes: QuantizedNote[]): QuantizedNote {
  // Keep earliest start; then higher velocity; then lower pitch
  return [...notes].sort((a, b) => {
    if (a.startTick !== b.startTick) return a.startTick - b.startTick;
    if (b.velocity !== a.velocity) return b.velocity - a.velocity;
    return a.pitch - b.pitch;
  })[0]!;
}

function resolveMonophonic(
  notes: QuantizedNote[],
  diagnostics: ConversionDiagnostic[],
  label: string,
): { kept: QuantizedNote[]; dropped: number } {
  if (notes.length === 0) return { kept: [], dropped: 0 };
  const sorted = [...notes].sort((a, b) => {
    if (a.startTick !== b.startTick) return a.startTick - b.startTick;
    if (b.velocity !== a.velocity) return b.velocity - a.velocity;
    if (a.pitch !== b.pitch) return a.pitch - b.pitch;
    return a.sourceEventIndex - b.sourceEventIndex;
  });

  const kept: QuantizedNote[] = [];
  let dropped = 0;
  for (const n of sorted) {
    const end = n.startTick + n.durationTicks;
    const conflict = kept.find((k) => {
      const kEnd = k.startTick + k.durationTicks;
      return intervalsOverlap(n.startTick, end, k.startTick, kEnd, 0);
    });
    if (conflict) {
      // Same start → chord flatten
      if (conflict.startTick === n.startTick) {
        const winner = flattenChord([conflict, n]);
        if (winner !== conflict) {
          const idx = kept.indexOf(conflict);
          kept[idx] = winner;
        }
        dropped += 1;
        diagnostics.push({
          level: 'warn',
          code: 'chord_flatten',
          message: `Flattened chord on ${label} at tick ${n.startTick}; kept pitch ${winner.pitch}`,
        });
      } else {
        dropped += 1;
        diagnostics.push({
          level: 'warn',
          code: 'mono_conflict',
          message: `Dropped overlapping note on ${label} at tick ${n.startTick} pitch ${n.pitch}`,
        });
      }
    } else {
      kept.push(n);
    }
  }
  return { kept, dropped };
}

/**
 * Priority for monophonic noise packing (higher wins the native tick).
 * Snare/clap beats kick on stacks — four-on-the-floor MIDIs often layer
 * kick+snare on 2/4; keeping kick and flamming snare ruins the backbeat.
 */
function drumTokenRank(token: string): number {
  switch (token) {
    case 'snare':
      return 5;
    case 'kick':
      return 4;
    case 'crash':
      return 2;
    case 'hihat':
    case 'shaker':
      return 2;
    case 'ghost':
      return 1;
    default:
      return 2;
  }
}

function compareDrumNotes(
  a: QuantizedNote,
  b: QuantizedNote,
  tokenFor: (n: QuantizedNote) => string,
): number {
  const ra = drumTokenRank(tokenFor(a));
  const rb = drumTokenRank(tokenFor(b));
  if (rb !== ra) return rb - ra;
  if (b.velocity !== a.velocity) return b.velocity - a.velocity;
  if (a.pitch !== b.pitch) return a.pitch - b.pitch;
  return a.sourceEventIndex - b.sourceEventIndex;
}

/**
 * Collapse stacked drum hits onto a monophonic noise channel.
 * Keep the highest-priority token on each tick; optionally flam lower-priority
 * tokens into nearby empty ticks (`drumFlamTicks`).
 */
function packDrumNotes(
  allDrumNotes: QuantizedNote[],
  flamTicks: number,
  diagnostics: ConversionDiagnostic[],
  tokenFor: (n: QuantizedNote) => string,
  onFlamCopy: (from: QuantizedNote, to: QuantizedNote) => void,
): { kept: QuantizedNote[]; dropped: number } {
  const byStart = new Map<number, QuantizedNote[]>();
  for (const n of allDrumNotes) {
    const list = byStart.get(n.startTick) ?? [];
    list.push(n);
    byStart.set(n.startTick, list);
  }

  const occupied = new Map<number, QuantizedNote>();
  const kept: QuantizedNote[] = [];
  const deferred: QuantizedNote[] = [];
  let dropped = 0;
  const cmp = (a: QuantizedNote, b: QuantizedNote) => compareDrumNotes(a, b, tokenFor);

  for (const [tick, group] of [...byStart.entries()].sort((a, b) => a[0] - b[0])) {
    const ranked = [...group].sort(cmp);
    const winner = ranked[0]!;
    occupied.set(tick, winner);
    kept.push(winner);

    // Same-token duplicates at this tick are dropped; other tokens may flam.
    const seenTokens = new Set([tokenFor(winner)]);
    for (const n of ranked.slice(1)) {
      const token = tokenFor(n);
      if (seenTokens.has(token)) {
        dropped += 1;
        continue;
      }
      seenTokens.add(token);
      deferred.push(n);
    }
  }

  deferred.sort((a, b) => a.startTick - b.startTick || cmp(a, b));

  for (const n of deferred) {
    const token = tokenFor(n);
    let placed = false;
    for (let d = 1; d <= flamTicks; d++) {
      const dest = n.startTick + d;
      if (occupied.has(dest)) continue;
      const nudged: QuantizedNote = {
        ...n,
        startTick: dest,
        durationTicks: Math.max(1, Math.min(n.durationTicks, 1)),
        shiftTicks: n.shiftTicks + d,
      };
      onFlamCopy(n, nudged);
      occupied.set(dest, nudged);
      kept.push(nudged);
      diagnostics.push({
        level: 'info',
        code: 'drum_flam',
        message: `Flam ${token} from tick ${n.startTick} → ${dest} (stacked drum on noise)`,
      });
      placed = true;
      break;
    }
    if (!placed) dropped += 1;
  }

  kept.sort((a, b) => a.startTick - b.startTick || cmp(a, b));
  return { kept, dropped };
}

function multiplexGroupForStream(stream: ClassifiedStream): ChipRoleSlot['multiplexGroup'] {
  // DMC before drums: classifyStreams sets isDrum for target:"dmc" overrides.
  if (stream.roleHint === 'dmc') return 'dmc';
  if (stream.isDrum || stream.roleHint === 'noise') return 'drums';
  if (stream.roleHint === 'wave' || stream.roleHint === 'triangle') return 'bass';
  return 'melodic-pulse';
}

function toHits(
  notes: QuantizedNote[],
  isDrum: boolean,
  instrument: string,
  forceInstTag: boolean,
): PackedHit[] {
  return notes.map((n) => ({
    startTick: n.startTick,
    durationTicks: n.durationTicks,
    token: noteTokenForHit(n, isDrum),
    velocity: n.velocity,
    instrument: forceInstTag ? instrument : undefined,
  }));
}

export interface PackResult {
  channels: PackedChannel[];
  notesDropped: number;
}

/**
 * Pack classified streams onto chip channels.
 */
export function packChannels(
  streams: ClassifiedStream[],
  options: MidiConvertOptions,
  diagnostics: ConversionDiagnostic[],
): PackResult {
  const table = getChipRoleTable(options.chip);
  const slots = table.map((s) => ({
    ...s,
    assigned: [] as { stream: ClassifiedStream; notes: QuantizedNote[] }[],
  }));

  let notesDropped = 0;
  const drumStreams: ClassifiedStream[] = [];
  const dmcStreams: ClassifiedStream[] = [];
  const melodic: ClassifiedStream[] = [];
  /** Per-note drum maps (survives flam copies that leave the original stream). */
  const drumMapByNote = new Map<QuantizedNote, ClassifiedStream['drumMap']>();

  for (const s of streams) {
    const g = multiplexGroupForStream(s);
    if (g === 'drums') drumStreams.push(s);
    else if (g === 'dmc') dmcStreams.push(s);
    else melodic.push(s);
  }

  for (const s of [...drumStreams, ...dmcStreams]) {
    for (const n of s.notes) drumMapByNote.set(n, s.drumMap);
  }

  const tokenForNote = (n: QuantizedNote) => mapDrumPitch(n.pitch, drumMapByNote.get(n));
  const drumTokenForPacked = (n: QuantizedNote, role: ClassifiedStream['roleHint'], streamMap?: ClassifiedStream['drumMap']) => {
    const map = streamMap ?? drumMapByNote.get(n);
    return role === 'dmc' ? dmcTokenForHit(n, map) : noteTokenForHit(n, true, map);
  };

  // Assign melodic streams — prefer matching role, else multiplex, else drop lowest priority
  const pending = [...melodic].sort((a, b) => b.priority - a.priority);

  for (const stream of pending) {
    const group = multiplexGroupForStream(stream);
    const candidates = slots.filter(
      (s) =>
        s.multiplexGroup === group ||
        (group === 'melodic-pulse' && s.multiplexGroup === 'melodic-pulse'),
    );

    const canMultiplex = (s: (typeof slots)[number]) =>
      s.assigned.length === 0 ||
      s.assigned.every((a) => !streamOverlaps(a.notes, stream.notes, options.maxOverlapTicks));

    // 1) Exact role match that is empty or multiplexable
    let target =
      candidates.find((s) => s.role === stream.roleHint && canMultiplex(s)) ??
      // 2) Any empty slot in group
      candidates.find((s) => s.assigned.length === 0) ??
      // 3) Multiplex onto any compatible occupied slot
      candidates.find((s) => canMultiplex(s));

    if (!target) {
      // Over-polyphony: drop this stream
      notesDropped += stream.notes.length;
      diagnostics.push({
        level: 'warn',
        code: 'over_polyphony',
        message: `Dropped stream ${stream.id} (${stream.notes.length} notes): exceeds ${options.chip} melodic channels`,
      });
      continue;
    }

    const { kept, dropped } = resolveMonophonic(
      stream.notes,
      diagnostics,
      `${target.role}/ch${target.channelIndex}`,
    );
    notesDropped += dropped;
    const family = stream.gmFamily ?? 'lead';
    const instrument =
      stream.instrumentLocked || stream.isDrum
        ? stream.instrument
        : instrumentNameForFamilyRole(family, target.role);
    target.assigned.push({
      stream: { ...stream, instrument, roleHint: target.role },
      notes: kept,
    });
  }

  // Drums → noise slot (always merge all drum streams onto noise)
  const noiseSlot = slots.find((s) => s.role === 'noise');
  if (noiseSlot && drumStreams.length > 0) {
    const allDrumNotes = drumStreams.flatMap((s) => s.notes);
    const sharedMap =
      drumStreams.length === 1 ? drumStreams[0]!.drumMap : undefined;
    const { kept, dropped } = packDrumNotes(
      allDrumNotes,
      options.drumFlamTicks,
      diagnostics,
      tokenForNote,
      (from, to) => {
        drumMapByNote.set(to, drumMapByNote.get(from));
      },
    );
    notesDropped += dropped;
    noiseSlot.assigned.push({
      stream: {
        id: 'drums',
        roleHint: 'noise',
        instrument: 'hihat',
        isDrum: true,
        drumMap: sharedMap,
        notes: kept,
        sourceTrackIndex: -1,
        midiChannel: 9,
        priority: 50,
      },
      notes: kept,
    });
  }

  // Optional DMC reinforcement
  const dmcSlot = slots.find((s) => s.role === 'dmc');
  if (dmcSlot && options.chip === 'nes' && options.dmcReinforcement.enabled) {
    const kicksSnares = (noiseSlot?.assigned[0]?.notes ?? []).filter((n) => {
      const p = n.pitch;
      return p === 35 || p === 36 || p === 38 || p === 39 || p === 40;
    });
    if (kicksSnares.length > 0 || dmcStreams.length > 0) {
      const notes = [...kicksSnares, ...dmcStreams.flatMap((s) => s.notes)];
      const { kept, dropped } = resolveMonophonic(notes, diagnostics, 'dmc');
      notesDropped += dropped;
      const sharedDmcMap =
        dmcStreams.length === 1 ? dmcStreams[0]!.drumMap : noiseSlot?.assigned[0]?.stream.drumMap;
      dmcSlot.assigned.push({
        stream: {
          id: 'dmc',
          roleHint: 'dmc',
          instrument: DMC_KICK,
          isDrum: true,
          drumMap: sharedDmcMap,
          notes: kept,
          sourceTrackIndex: -1,
          midiChannel: 9,
          priority: 60,
        },
        notes: kept,
      });
    }
  }

  const channels: PackedChannel[] = [];
  for (const slot of slots) {
    if (slot.assigned.length === 0) continue;
    const multi = slot.assigned.length > 1;
    const hits: PackedHit[] = [];
    let currentInst: string | undefined;

    // Merge all assigned note lists into a single timeline
    type Tagged = { note: QuantizedNote; instrument: string; isDrum: boolean };
    const tagged: Tagged[] = [];
    for (const a of slot.assigned) {
      for (const n of a.notes) {
        tagged.push({
          note: n,
          instrument: a.stream.isDrum
            ? drumTokenForPacked(n, slot.role, a.stream.drumMap)
            : a.stream.instrument,
          isDrum: a.stream.isDrum,
        });
      }
    }
    tagged.sort((a, b) => {
      if (a.note.startTick !== b.note.startTick) return a.note.startTick - b.note.startTick;
      if (b.note.velocity !== a.note.velocity) return b.note.velocity - a.note.velocity;
      return a.note.pitch - b.note.pitch;
    });

    // Re-resolve mono across merged streams
    const mergedNotes = tagged.map((t) => t.note);
    const { kept, dropped } = resolveMonophonic(mergedNotes, diagnostics, `merged/${slot.role}`);
    notesDropped += dropped;
    const keptSet = new Set(kept);

    for (const t of tagged) {
      if (!keptSet.has(t.note)) continue;
      const needInst = multi && !t.isDrum && t.instrument !== currentInst;
      if (needInst) currentInst = t.instrument;
      hits.push({
        startTick: t.note.startTick,
        durationTicks: t.note.durationTicks,
        token: t.isDrum ? t.instrument : noteTokenForHit(t.note, false),
        velocity: t.note.velocity,
        instrument: needInst ? t.instrument : undefined,
      });
    }

    channels.push({
      channelIndex: slot.channelIndex,
      role: slot.role,
      defaultInstrument: slot.assigned[0]!.stream.isDrum
        ? slot.defaultInstrument
        : slot.assigned[0]!.stream.instrument,
      hits,
    });
  }

  diagnostics.push({
    level: 'info',
    code: 'channels_packed',
    message: `Packed ${channels.length} channel(s); dropped ${notesDropped} note(s)`,
  });

  return { channels, notesDropped };
}

// silence unused helper warning path — toHits kept for clarity in tests
export { toHits };
