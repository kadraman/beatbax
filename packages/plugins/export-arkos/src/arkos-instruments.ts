import {
  DEFAULT_INSTRUMENT_COLOR,
  EMPTY_INSTRUMENT_COLOR,
  type ArkosInstrument,
  type ArkosInstrumentCell,
  type ChannelLink,
  type SongLike,
} from './arkos-types.js';

function parseBool(value: unknown, defaultValue = false): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = String(value).toLowerCase().trim();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === '') return false;
  return defaultValue;
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Resolve AY mixer routing (mirrors chip-spectrum-128). */
export function resolveMixerRouting(instrument: Record<string, unknown>): {
  toneEnable: boolean;
  noiseEnable: boolean;
  noiseRate: number;
} {
  const noiseRateRaw = parseNumber(instrument.noise_rate);
  const hasNoiseRate = noiseRateRaw !== undefined;
  const noiseEnable = hasNoiseRate && parseBool(instrument.tone_mix, false);
  const noiseRate = hasNoiseRate ? clamp(noiseRateRaw!, 0, 31) : 0;

  let toneEnable = true;
  if (instrument.tone !== undefined) {
    toneEnable = parseBool(instrument.tone, true);
  } else if (noiseEnable) {
    toneEnable = false;
  }

  return { toneEnable, noiseEnable, noiseRate };
}

function resolveLink(toneEnable: boolean, noiseEnable: boolean): ChannelLink {
  if (toneEnable) return 'softwareOnly';
  if (noiseEnable) return 'noSoftwareNoHardware';
  return 'noSoftwareNoHardware';
}

function buildCells(inst: Record<string, unknown>): ArkosInstrumentCell[] {
  const vol = clamp(parseNumber(inst.vol) ?? 15, 0, 15);
  const { toneEnable, noiseEnable, noiseRate } = resolveMixerRouting(inst);
  const link = resolveLink(toneEnable, noiseEnable);
  const noise = noiseEnable ? noiseRate : 0;

  // Single-cell sustain instrument. Macros are rejected in validate-export.
  return [
    {
      volume: vol,
      noise,
      link,
      primaryPeriod: 0,
      primaryArpeggioNoteInOctave: 0,
      primaryArpeggioOctave: 0,
      primaryPitch: 0,
      ratio: 4,
      hardwareEnvelope: 8,
      isRetrig: false,
    },
  ];
}

function emptyInstrument(): ArkosInstrument {
  // Match AT3 canonical Empty instrument (Instrument::buildEmptyInstrument).
  return {
    index: 0,
    name: 'Empty',
    colorArgb: EMPTY_INSTRUMENT_COLOR,
    speed: 255,
    isRetrig: false,
    loopStartIndex: 0,
    endIndex: 0,
    isLooping: true,
    isSfxExported: true,
    cells: [
      {
        volume: 0,
        noise: 0,
        link: 'noSoftwareNoHardware',
        primaryPeriod: 0,
        primaryArpeggioNoteInOctave: 0,
        primaryArpeggioOctave: 0,
        primaryPitch: 0,
        ratio: 4,
        hardwareEnvelope: 8,
        isRetrig: false,
      },
    ],
  };
}

/**
 * Build Arkos instruments from BeatBax `insts`.
 * Index 0 is always the Empty instrument; BeatBax instruments start at 1.
 */
export function buildInstruments(song: SongLike): {
  instruments: ArkosInstrument[];
  /** BeatBax instrument name → Arkos instrument index (1-based for real instruments). */
  indexByName: Map<string, number>;
} {
  const indexByName = new Map<string, number>();
  const instruments: ArkosInstrument[] = [emptyInstrument()];
  const names = Object.keys(song.insts ?? {}).sort();

  for (const name of names) {
    const inst = song.insts[name] ?? {};
    const cells = buildCells(inst);
    const index = instruments.length;
    indexByName.set(name, index);
    // BeatBax holds a constant `vol` for the whole note step. In Arkos that
    // means a single-cell instrument must loop; otherwise AT3 plays one cell
    // (1 frame at speed 0) then goes silent for the rest of the row — very clipped.
    const endIndex = Math.max(0, cells.length - 1);
    instruments.push({
      index,
      name,
      colorArgb: DEFAULT_INSTRUMENT_COLOR,
      speed: 0,
      isRetrig: false,
      loopStartIndex: 0,
      endIndex,
      isLooping: true,
      isSfxExported: true,
      cells,
    });
  }

  return { instruments, indexByName };
}
