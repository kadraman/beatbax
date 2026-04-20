/**
 * ISM event → FTM row conversion, effect encoding, and pattern assembly.
 */

import { FtmEffect, FtmRow, NesChannelType, ChannelEventLike } from './ftm-types.js';

// ─── Note encoding ────────────────────────────────────────────────────────────

/** Semitone offset for each note name (A=9, B=11, C=0, ...). */
const NOTE_SEMITONES: Record<string, number> = {
  C: 0,
  'C#': 1,
  DB: 1,
  D: 2,
  'D#': 3,
  EB: 3,
  E: 4,
  F: 5,
  'F#': 6,
  GB: 6,
  G: 7,
  'G#': 8,
  AB: 8,
  A: 9,
  'A#': 10,
  BB: 10,
  B: 11,
  // CB is handled specially in noteToFtm (Cb = B of the previous octave)
};

/**
 * FTM note names in order of semitone (0=C … 11=B).
 * Natural notes use `-` separator; sharps use `#`.
 */
const FTM_NOTE_NAMES = [
  'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-',
];

/**
 * Convert a BeatBax note token (e.g. "C4", "A#3", "Bb5") to a FamiTracker
 * text note string (e.g. "C-2", "A#1", "A#3").
 *
 * Octave conversion: ftm_octave = beatbax_octave - 2.
 * Returns "..." if the note is out of FTM range or cannot be parsed.
 */
export function noteToFtm(token: string): string {
  const match = token.match(/^([A-Ga-g])([#bB]?)(\d+)$/);
  if (!match) return '...';

  const letter = match[1].toUpperCase();
  const acc = match[2];
  const beatbaxOctave = parseInt(match[3], 10);
  const ftmOctave = beatbaxOctave - 2;

  const key = letter + (acc === '#' ? '#' : acc === 'b' || acc === 'B' ? 'B' : '');

  // Cb is enharmonically B of the previous octave
  if (letter === 'C' && (acc === 'b' || acc === 'B')) {
    const actualOctave = ftmOctave - 1;
    if (actualOctave < 0 || actualOctave > 7) return '...';
    return `B-${actualOctave}`;
  }

  const semi = NOTE_SEMITONES[key];
  if (semi === undefined) return '...';

  if (ftmOctave < 0 || ftmOctave > 7) return '...';
  return `${FTM_NOTE_NAMES[semi]}${ftmOctave}`;
}

/** Noise period index 0-15 (normal mode) to FTM noise note string. */
const NOISE_NOTES_NORMAL = [
  'C-0', 'C#0', 'D-0', 'D#0', 'E-0', 'F-0', 'F#0', 'G-0', 'G#0', 'A-0', 'A#0', 'B-0',
  'C-1', 'C#1', 'D-1', 'D#1',
];

/** Noise period index 0-15 (loop mode) to FTM noise note string. */
const NOISE_NOTES_LOOP = [
  'C-1', 'C#1', 'D-1', 'D#1', 'E-1', 'F-1', 'F#1', 'G-1', 'G#1', 'A-1', 'A#1', 'B-1',
  'C-2', 'C#2', 'D-2', 'D#2',
];

/** Get the FTM noise note for an instrument's noise_period and noise_mode. */
export function noiseNoteToFtm(inst: Record<string, any>): string {
  const period = Math.max(0, Math.min(15, Math.round(Number(inst.noise_period ?? 12))));
  const loop = String(inst.noise_mode ?? 'normal').toLowerCase() === 'loop';
  return loop ? NOISE_NOTES_LOOP[period] : NOISE_NOTES_NORMAL[period];
}

// ─── Effect encoding ──────────────────────────────────────────────────────────

/** Dropped effects — not supported in FTM. */
const DROPPED_EFFECTS = new Set(['trem', 'echo', 'retrig']);

/** Effects dropped on specific channel types (beyond the globally dropped ones). */
const CHANNEL_DROPPED_EFFECTS: Record<NesChannelType, Set<string>> = {
  pulse1: new Set(['trem', 'echo', 'retrig']),
  pulse2: new Set(['sweep', 'trem', 'echo', 'retrig']),
  triangle: new Set(['volslide', 'trem', 'sweep', 'echo', 'retrig']),
  noise: new Set(['vib', 'arp', 'bend', 'port', 'sweep', 'trem', 'echo', 'retrig']),
  dmc: new Set(['vib', 'arp', 'bend', 'port', 'sweep', 'volslide', 'trem', 'echo', 'retrig']),
};

function toHex1(n: number): string {
  return Math.max(0, Math.min(15, Math.round(n))).toString(16).toUpperCase();
}
function toHex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Encode one BeatBax effect to a FTM effect string.
 * Returns null if the effect is dropped (unsupported or channel-incompatible).
 * Warnings are accumulated in the `warnings` array.
 */
export function encodeEffect(
  effectType: string,
  params: Array<string | number>,
  channelType: NesChannelType,
  warnings: string[],
): string | null {
  const type = effectType.toLowerCase();

  // Always-dropped effects
  if (DROPPED_EFFECTS.has(type)) {
    warnings.push(`Effect '${type}' dropped: not supported in FamiTracker`);
    return null;
  }

  // Channel-specific drops
  const channelDropped = CHANNEL_DROPPED_EFFECTS[channelType];
  if (channelDropped.has(type)) {
    warnings.push(`Effect '${type}' dropped on ${channelType} channel`);
    return null;
  }

  switch (type) {
    case 'arp': {
      // 0xy: x = first offset (high nibble), y = second offset (low nibble)
      const semi1 = Math.max(0, Math.min(15, Math.round(Number(params[0] ?? 0))));
      const semi2 = Math.max(0, Math.min(15, Math.round(Number(params[1] ?? 0))));
      if (params.length > 2) {
        warnings.push(
          `Effect 'arp' has ${params.length} offsets; FTM 0xy only supports 2. Third+ offsets dropped.`,
        );
      }
      return `0${toHex1(semi1)}${toHex1(semi2)}`;
    }

    case 'cut': {
      // Sxx: xx = tick count
      const ticks = Math.max(0, Math.min(255, Math.round(Number(params[0] ?? 1))));
      return `S${toHex2(ticks)}`;
    }

    case 'volslide': {
      // Axy: x = up nibble (positive delta), y = down nibble (negative delta)
      const delta = Number(params[0] ?? 0);
      if (params.length > 1) {
        warnings.push(
          `Effect 'volSlide' with 'steps' parameter exported as continuous slide (FTM limitation)`,
        );
      }
      if (delta > 0) {
        return `A${toHex1(Math.min(15, Math.abs(delta)))}0`;
      } else {
        return `A0${toHex1(Math.min(15, Math.abs(delta)))}`;
      }
    }

    case 'vib': {
      // 4xy: x = speed (rate), y = depth
      const depth = Math.max(0, Math.min(15, Math.round(Number(params[0] ?? 1))));
      const rate = Math.max(1, Math.min(15, Math.round(Number(params[1] ?? 4))));
      return `4${toHex1(rate)}${toHex1(depth)}`;
    }

    case 'bend': {
      // 1xx (slide up) or 2xx (slide down): xx = speed
      const semitones = Number(params[0] ?? 0);
      if (semitones === 0) return null;
      // Approximate: 4 period-units per semitone in mid-range
      const speed = Math.max(1, Math.min(255, Math.round(Math.abs(semitones) * 4)));
      const code = semitones > 0 ? '1' : '2';
      return `${code}${toHex2(speed)}`;
    }

    case 'port': {
      // 3xx: portamento speed
      const speed = Math.max(0, Math.min(255, Math.round(Number(params[0] ?? 8))));
      return `3${toHex2(speed)}`;
    }

    case 'sweep': {
      // Hxy: x = period (1-7), y = shift (0-7 | 8 for down)
      // Only valid on pulse1; pulse2/others are filtered above.
      const period = Math.max(1, Math.min(7, Math.round(Number(params[0] ?? 4))));
      const dirStr = String(params[1] ?? 'down').toLowerCase();
      const shift = Math.max(0, Math.min(7, Math.round(Number(params[2] ?? 1))));
      const yNibble = shift | (dirStr === 'down' || dirStr === '-' ? 8 : 0);
      return `H${toHex1(period)}${toHex1(yNibble)}`;
    }

    default:
      // Unknown effect — drop silently
      return null;
  }
}

/**
 * Effect priority order for when more than 4 effects appear on one row.
 * Lower index = higher priority.
 */
const EFFECT_PRIORITY: Record<string, number> = {
  '0': 0,  // arp
  'S': 1,  // cut
  'A': 2,  // volSlide
  '1': 3,  // slide up
  '2': 3,  // slide down
  '3': 3,  // portamento
  '4': 4,  // vib
  'H': 5,  // sweep
};

function effectPriority(code: string): number {
  return EFFECT_PRIORITY[code[0]] ?? 99;
}

/** Reusable empty row — returned for rest and sustain events. */
const EMPTY_ROW: FtmRow = Object.freeze({
  note: '...',
  instrument: '..',
  volume: '.',
  effects: [],
});

/**
 * Build a single FtmRow for an ISM event. */
export function buildRow(
  event: ChannelEventLike,
  instIndex: number | null,
  channelType: NesChannelType,
  maxEffectCols: number,
  warnings: string[],
): FtmRow {
  if (event.type === 'rest') {
    return EMPTY_ROW;
  }

  if (event.type === 'sustain') {
    return EMPTY_ROW;
  }

  if (event.type === 'note' || event.type === 'named') {
    const ev = event;
    const instProps = ev.instProps as Record<string, any> | undefined;
    const instType = String(instProps?.type ?? '').toLowerCase() as NesChannelType;

    // Determine note
    let note: string;
    if (channelType === 'noise' || instType === 'noise') {
      note = noiseNoteToFtm(instProps ?? {});
    } else if (channelType === 'dmc' || instType === 'dmc') {
      note = 'C-2'; // DMC trigger note (ignored by FTM; pitch from instrument)
    } else if (ev.token) {
      note = noteToFtm(ev.token);
      if (note === '...') return EMPTY_ROW; // out of range
    } else if (ev.defaultNote) {
      note = noteToFtm(ev.defaultNote);
      if (note === '...') return EMPTY_ROW;
    } else {
      return EMPTY_ROW;
    }

    const instrument = instIndex !== null ? toHex2(instIndex) : '..';
    const volume = '.';

    // Encode effects
    const rawEffects = Array.isArray(ev.effects) ? ev.effects : [];
    const encoded: string[] = [];
    for (const fx of rawEffects) {
      const code = encodeEffect(fx.type, fx.params ?? [], channelType, warnings);
      if (code !== null) encoded.push(code);
    }

    // Instrument-level sweep (pulse1 only)
    if (channelType === 'pulse1' && instProps?.sweep_en) {
      const sweepCode = encodeEffect(
        'sweep',
        [instProps['sweep_period'] ?? 4, instProps['sweep_dir'] ?? 'down', instProps['sweep_shift'] ?? 1],
        channelType,
        warnings,
      );
      if (sweepCode !== null) encoded.push(sweepCode);
    }

    // Sort by priority and limit to maxEffectCols
    encoded.sort((a, b) => effectPriority(a) - effectPriority(b));
    if (encoded.length > maxEffectCols) {
      warnings.push(
        `Row has ${encoded.length} effects; dropping ${encoded.length - maxEffectCols} low-priority effects`,
      );
    }

    const effects: FtmEffect[] = encoded
      .slice(0, Math.max(maxEffectCols, 1))
      .map((code) => ({ code }));

    return { note, instrument, volume, effects };
  }

  return EMPTY_ROW;
}

// ─── Pattern grouping ─────────────────────────────────────────────────────────

/**
 * Compute tick length of a raw pattern token array from `song.pats`.
 * Tokens like "C4:8" contribute 8 ticks; plain tokens ("C4", ".") contribute 1 tick.
 */
export function patternTickLength(tokens: string[]): number {
  let total = 0;
  for (const token of tokens) {
    const durMatch = token.match(/:(\d+)$/);
    total += durMatch ? parseInt(durMatch[1], 10) : 1;
  }
  return total;
}

/**
 * Group a channel's flat event stream into frames (one per pattern occurrence).
 *
 * Strategy: use `sourcePattern` from the event metadata combined with pattern
 * tick lengths from `song.pats` to slice the stream at exact pattern boundaries.
 *
 * Falls back to 16-event chunks if no sourcePattern metadata is available.
 */
export function groupEventsIntoFrames(
  events: ChannelEventLike[],
  pats: Record<string, string[]>,
  defaultChunkSize = 16,
): ChannelEventLike[][] {
  if (events.length === 0) return [];

  const frames: ChannelEventLike[][] = [];
  let i = 0;

  while (i < events.length) {
    const ev = events[i] as ChannelEventLike;
    const patName: string | undefined = ev.sourcePattern;

    if (!patName || !pats[patName]) {
      // No pattern metadata — fall back to fixed chunk size
      const size = Math.min(defaultChunkSize, events.length - i);
      frames.push(events.slice(i, i + size));
      i += size;
      continue;
    }

    const tickLen = patternTickLength(pats[patName]);
    if (tickLen <= 0) {
      // Degenerate pattern — take 1 event
      frames.push([events[i]]);
      i++;
      continue;
    }

    const end = Math.min(i + tickLen, events.length);
    frames.push(events.slice(i, end));
    i += tickLen;
  }

  return frames;
}

/**
 * Build FtmRow[] for a slice of events, padded to `rowCount`.
 */
export function buildPatternRows(
  events: ChannelEventLike[],
  rowCount: number,
  instMap: Map<string, number>,
  channelType: NesChannelType,
  warnings: string[],
): FtmRow[] {
  const rows: FtmRow[] = [];
  const MAX_EFFECT_COLS = 4;

  for (let r = 0; r < rowCount; r++) {
    const ev = r < events.length ? events[r] : undefined;
    if (!ev) {
      rows.push({ note: '...', instrument: '..', volume: '.', effects: [] });
      continue;
    }

    const ev2 = ev as ChannelEventLike;
    const instName: string | undefined = ev2.instrument;
    const instIndex = instName !== undefined ? (instMap.get(instName) ?? null) : null;

    rows.push(buildRow(ev, instIndex, channelType, MAX_EFFECT_COLS, warnings));
  }

  return rows;
}
