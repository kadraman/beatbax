/**
 * Config defaults and validation for MIDI → .bax conversion.
 */
import type {
  ChipRole,
  MidiChipId,
  MidiConvertOptions,
  MidiImportConfig,
  QuantizeGrid,
  QuantizeMode,
  QuantizeOptions,
  TrackMapping,
} from './types.js';

export const DEFAULT_TICKS_PER_BEAT = 4;
export const DEFAULT_PATTERN_TICKS = 16;
export const DEFAULT_QUANTIZE_MODE: QuantizeMode = 'nearest';
export const DEFAULT_QUANTIZE_GRID: QuantizeGrid = '1/16';
export const DEFAULT_MAX_SHIFT_TICKS = 1;
export const DEFAULT_MAX_OVERLAP_TICKS = 0;

const SUPPORTED_CHIPS = new Set<MidiChipId>(['gameboy', 'nes']);
const QUANTIZE_MODES = new Set<QuantizeMode>(['nearest', 'floor', 'ceil', 'strict']);
const QUANTIZE_GRIDS = new Set<QuantizeGrid>(['1/4', '1/8', '1/16', '1/32']);

export function defaultQuantizeOptions(): QuantizeOptions {
  return {
    mode: DEFAULT_QUANTIZE_MODE,
    grid: DEFAULT_QUANTIZE_GRID,
    maxShiftTicks: DEFAULT_MAX_SHIFT_TICKS,
  };
}

export function defaultConvertOptions(chip: MidiChipId): MidiConvertOptions {
  return {
    chip,
    ticksPerBeat: DEFAULT_TICKS_PER_BEAT,
    patternTicks: DEFAULT_PATTERN_TICKS,
    quantize: defaultQuantizeOptions(),
    maxOverlapTicks: DEFAULT_MAX_OVERLAP_TICKS,
    strict: false,
    dmcReinforcement: { enabled: false },
  };
}

/** Grid fraction → BeatBax ticks per grid unit at the given ticksPerBeat. */
export function gridToTicks(grid: QuantizeGrid, ticksPerBeat: number): number {
  switch (grid) {
    case '1/4':
      return ticksPerBeat;
    case '1/8':
      return Math.max(1, Math.floor(ticksPerBeat / 2));
    case '1/16':
      return Math.max(1, Math.floor(ticksPerBeat / 4));
    case '1/32':
      return Math.max(1, Math.floor(ticksPerBeat / 8));
    default:
      return Math.max(1, Math.floor(ticksPerBeat / 4));
  }
}

export function parseQuantizeMode(raw: string | undefined): QuantizeMode {
  const v = String(raw ?? DEFAULT_QUANTIZE_MODE).toLowerCase() as QuantizeMode;
  if (!QUANTIZE_MODES.has(v)) {
    throw new Error(`Invalid quantize mode '${raw}'; expected nearest|floor|ceil|strict`);
  }
  return v;
}

export function parseQuantizeGrid(raw: string | undefined): QuantizeGrid {
  const v = String(raw ?? DEFAULT_QUANTIZE_GRID) as QuantizeGrid;
  if (!QUANTIZE_GRIDS.has(v)) {
    throw new Error(`Invalid quantize grid '${raw}'; expected 1/4|1/8|1/16|1/32`);
  }
  return v;
}

export function parseChipId(raw: string | undefined): MidiChipId {
  const v = String(raw ?? '').toLowerCase() as MidiChipId;
  if (!SUPPORTED_CHIPS.has(v)) {
    throw new Error(`Unsupported or missing chip '${raw}'; v1 supports gameboy|nes`);
  }
  return v;
}

/**
 * Merge CLI flags + optional JSON config into a fully-resolved options object.
 * CLI flags win over config file for overlapping scalar fields.
 */
export function resolveConvertOptions(args: {
  chip: string;
  config?: MidiImportConfig | null;
  quantize?: string;
  grid?: string;
  maxOverlapTicks?: number;
  maxBars?: number;
  strict?: boolean;
  title?: string;
}): MidiConvertOptions {
  const cfg = args.config ?? {};
  const chip = parseChipId(args.chip || cfg.chip);
  const base = defaultConvertOptions(chip);

  const quantize: QuantizeOptions = {
    mode: args.quantize
      ? parseQuantizeMode(args.quantize)
      : parseQuantizeMode(cfg.quantize?.mode ?? base.quantize.mode),
    grid: args.grid
      ? parseQuantizeGrid(args.grid)
      : parseQuantizeGrid(cfg.quantize?.grid ?? base.quantize.grid),
    maxShiftTicks:
      typeof cfg.quantize?.maxShiftTicks === 'number'
        ? cfg.quantize.maxShiftTicks
        : base.quantize.maxShiftTicks,
  };

  return {
    chip,
    ticksPerBeat:
      typeof cfg.ticksPerBeat === 'number' && cfg.ticksPerBeat > 0
        ? Math.floor(cfg.ticksPerBeat)
        : base.ticksPerBeat,
    patternTicks:
      typeof cfg.patternTicks === 'number' && cfg.patternTicks > 0
        ? Math.floor(cfg.patternTicks)
        : base.patternTicks,
    quantize,
    maxOverlapTicks:
      typeof args.maxOverlapTicks === 'number'
        ? Math.max(0, Math.floor(args.maxOverlapTicks))
        : typeof cfg.maxOverlapTicks === 'number'
          ? Math.max(0, Math.floor(cfg.maxOverlapTicks))
          : base.maxOverlapTicks,
    maxBars:
      typeof args.maxBars === 'number'
        ? Math.max(1, Math.floor(args.maxBars))
        : typeof cfg.maxBars === 'number'
          ? Math.max(1, Math.floor(cfg.maxBars))
          : undefined,
    strict: args.strict === true,
    trackMappings: Array.isArray(cfg.trackMappings) ? cfg.trackMappings : undefined,
    dmcReinforcement: {
      enabled: cfg.dmcReinforcement?.enabled === true,
      kickSample: cfg.dmcReinforcement?.kickSample ?? '@nes/kick',
      snareSample: cfg.dmcReinforcement?.snareSample ?? '@nes/snare',
    },
    title: args.title,
  };
}

/** Validate and normalize a parsed JSON config object. */
export function parseImportConfig(raw: unknown): MidiImportConfig {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Import config must be a JSON object');
  }
  const o = raw as Record<string, unknown>;
  const out: MidiImportConfig = {};

  if (o.chip != null) out.chip = parseChipId(String(o.chip));
  if (o.ticksPerBeat != null) {
    const n = Number(o.ticksPerBeat);
    if (!Number.isFinite(n) || n <= 0) throw new Error('ticksPerBeat must be a positive number');
    out.ticksPerBeat = Math.floor(n);
  }
  if (o.patternTicks != null) {
    const n = Number(o.patternTicks);
    if (!Number.isFinite(n) || n <= 0) throw new Error('patternTicks must be a positive number');
    out.patternTicks = Math.floor(n);
  }
  if (o.maxOverlapTicks != null) {
    const n = Number(o.maxOverlapTicks);
    if (!Number.isFinite(n) || n < 0) throw new Error('maxOverlapTicks must be >= 0');
    out.maxOverlapTicks = Math.floor(n);
  }
  if (o.maxBars != null) {
    const n = Number(o.maxBars);
    if (!Number.isFinite(n) || n < 1) throw new Error('maxBars must be >= 1');
    out.maxBars = Math.floor(n);
  }
  if (o.quantize != null && typeof o.quantize === 'object' && !Array.isArray(o.quantize)) {
    const q = o.quantize as Record<string, unknown>;
    out.quantize = {};
    if (q.mode != null) out.quantize.mode = parseQuantizeMode(String(q.mode));
    if (q.grid != null) out.quantize.grid = parseQuantizeGrid(String(q.grid));
    if (q.maxShiftTicks != null) {
      const n = Number(q.maxShiftTicks);
      if (!Number.isFinite(n) || n < 0) throw new Error('quantize.maxShiftTicks must be >= 0');
      out.quantize.maxShiftTicks = Math.floor(n);
    }
  }
  if (o.dmcReinforcement != null && typeof o.dmcReinforcement === 'object') {
    const d = o.dmcReinforcement as Record<string, unknown>;
    out.dmcReinforcement = {
      enabled: d.enabled === true,
      kickSample: typeof d.kickSample === 'string' ? d.kickSample : undefined,
      snareSample: typeof d.snareSample === 'string' ? d.snareSample : undefined,
    };
  }
  if (Array.isArray(o.trackMappings)) {
    const mappings: TrackMapping[] = [];
    for (let i = 0; i < o.trackMappings.length; i++) {
      const m = o.trackMappings[i];
      if (m == null || typeof m !== 'object') {
        throw new Error(`trackMappings[${i}] must be an object`);
      }
      const tm = m as Record<string, unknown>;
      if (typeof tm.target !== 'string') {
        throw new Error(`trackMappings[${i}].target is required`);
      }
      mappings.push({
        midiTrack: typeof tm.midiTrack === 'number' ? tm.midiTrack : undefined,
        midiChannel: typeof tm.midiChannel === 'number' ? tm.midiChannel : undefined,
        target: tm.target as ChipRole,
        instrument: typeof tm.instrument === 'string' ? tm.instrument : undefined,
        drumMap:
          tm.drumMap && typeof tm.drumMap === 'object' && !Array.isArray(tm.drumMap)
            ? (tm.drumMap as Record<string, string>)
            : undefined,
      });
    }
    out.trackMappings = mappings;
  }
  return out;
}
