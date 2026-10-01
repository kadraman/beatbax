/**
 * Config defaults and validation for MIDI → .bax conversion.
 */
import type {
  ChipRole,
  FamilyArticulationConfig,
  GmFamily,
  MidiChipId,
  MidiConvertOptions,
  MidiImportConfig,
  MonoPolicy,
  PackingMode,
  QuantizeGrid,
  QuantizeMode,
  QuantizeOptions,
  TempoPolicy,
  TrackMapping,
  UnmappedTracksMode,
} from './types.js';
import {
  buildProgramFamilyByProgram,
  mergeFamilyArticulations,
  parseGmFamily,
  parseProgramFamilyKey,
} from './kit.js';

export const DEFAULT_TICKS_PER_BEAT = 4;
export const DEFAULT_PATTERN_TICKS = 16;
export const DEFAULT_QUANTIZE_MODE: QuantizeMode = 'nearest';
export const DEFAULT_QUANTIZE_GRID: QuantizeGrid = '1/16';
export const DEFAULT_MAX_SHIFT_TICKS = 1;
export const DEFAULT_MAX_OVERLAP_TICKS = 0;
/**
 * Optional flam for stacked drums (0 = drop losers — default).
 * Prefer snare-over-kick on the same tick instead of flamming; enable flam
 * only when you want hats/ghosts nudged into empty ticks.
 */
export const DEFAULT_DRUM_FLAM_TICKS = 0;
/**
 * Bars per Pattern Grid section when emitting multi-seq channel lines.
 * `0` disables sectioning (monolithic one-seq-per-channel).
 */
export const DEFAULT_SECTION_BARS = 8;

const SUPPORTED_CHIPS = new Set<MidiChipId>(['gameboy', 'nes']);
const CHIP_ROLES = new Set<ChipRole>(['pulse1', 'pulse2', 'wave', 'triangle', 'noise', 'dmc']);
const QUANTIZE_MODES = new Set<QuantizeMode>(['nearest', 'floor', 'ceil', 'strict']);
const QUANTIZE_GRIDS = new Set<QuantizeGrid>(['1/4', '1/8', '1/16', '1/32']);
const MONO_POLICIES = ['earliest', 'highest', 'lowest', 'newest'] as const;
const PACKING_MODES = ['streams', 'lanes'] as const;
const UNMAPPED_MODES = ['auto', 'drop'] as const;
const TEMPO_POLICIES = ['first', 'longest'] as const;
const DRUM_TARGETS = new Set<ChipRole>(['noise', 'dmc']);
/** BeatBax identifiers used in `inst` names, `inst(...)` tokens, and channel bindings. */
const BAX_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** MIDI channel in config may be 0–15 (0-based) or 1–16 (1-based). */
const MIDI_CHANNEL_MIN = 0;
const MIDI_CHANNEL_MAX = 16;

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
    drumFlamTicks: DEFAULT_DRUM_FLAM_TICKS,
    sectionBars: DEFAULT_SECTION_BARS,
    strict: false,
    dmcReinforcement: { enabled: false },
    programFamilyByProgram: buildProgramFamilyByProgram(),
    familyArticulations: mergeFamilyArticulations(),
    packing: 'streams',
    unmappedTracks: 'auto',
    tempo: 'first',
    nudge: 0,
    annotate: false,
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

export function parseChipRole(raw: string | undefined, context = 'target'): ChipRole {
  const v = String(raw ?? '').toLowerCase() as ChipRole;
  if (!CHIP_ROLES.has(v)) {
    throw new Error(
      `Invalid ${context} '${raw}'; expected pulse1|pulse2|wave|triangle|noise|dmc`,
    );
  }
  return v;
}

/** Require a non-empty BeatBax identifier (`[A-Za-z_][A-Za-z0-9_-]*`). */
export function parseBaxIdentifier(raw: string, context: string): string {
  if (!BAX_IDENTIFIER.test(raw)) {
    throw new Error(
      `${context} must be a BeatBax identifier ([A-Za-z_][A-Za-z0-9_-]*); got ${JSON.stringify(raw)}`,
    );
  }
  return raw;
}

/**
 * Accept MIDI channel as 0–15 (0-based, matching Tone.js / SMF) or 1–16 (1-based).
 * Combined valid integers: 0 through 16 inclusive.
 */
export function parseMidiChannel(raw: unknown, context = 'midiChannel'): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < MIDI_CHANNEL_MIN || raw > MIDI_CHANNEL_MAX) {
    throw new Error(
      `${context} must be an integer in 0–15 (0-based) or 1–16 (1-based); got ${JSON.stringify(raw)}`,
    );
  }
  return raw;
}

const DUTY_CYCLE_VALUES = new Set([12.5, 25, 50, 75]);
const WAVE_VOLUME_VALUES = new Set([0, 25, 50, 100]);

function parseFiniteNumber(raw: unknown, context: string): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${context} must be a finite number; got ${JSON.stringify(raw)}`);
  }
  return n;
}

function parseIntInRange(raw: unknown, lo: number, hi: number, context: string): number {
  const n = parseFiniteNumber(raw, context);
  if (!Number.isInteger(n) || n < lo || n > hi) {
    throw new Error(`${context} must be an integer in ${lo}–${hi}; got ${JSON.stringify(raw)}`);
  }
  return n;
}

function parseIntegerAtLeast(raw: unknown, min: number, context: string): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min) {
    throw new Error(`${context} must be an integer >= ${min}; got ${JSON.stringify(raw)}`);
  }
  return raw;
}

function parseEnum<T extends string>(raw: unknown, values: readonly T[], context: string): T {
  if (typeof raw !== 'string' || !(values as readonly string[]).includes(raw)) {
    throw new Error(`${context} must be one of ${values.join('|')}; got ${JSON.stringify(raw)}`);
  }
  return raw as T;
}

function parseMidiNoteArray(raw: unknown, context: string): number[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${context} must be an array of MIDI note numbers 0–127; got ${JSON.stringify(raw)}`);
  }
  return raw.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x > 127) {
      throw new Error(`${context}[${i}] must be an integer in 0–127; got ${JSON.stringify(x)}`);
    }
    return x;
  });
}

/** Validate the 089 arrangement fields of one `trackMappings[]` entry. */
function parseMappingArrangement(tm: Record<string, unknown>, target: ChipRole, prefix: string): Partial<TrackMapping> {
  const out: Partial<TrackMapping> = {};
  if (tm.fromBar != null) out.fromBar = parseIntegerAtLeast(tm.fromBar, 1, `${prefix}.fromBar`);
  if (tm.toBar != null) out.toBar = parseIntegerAtLeast(tm.toBar, 1, `${prefix}.toBar`);
  if (out.fromBar != null && out.toBar != null && out.fromBar > out.toBar) {
    throw new Error(`${prefix}.fromBar (${out.fromBar}) must be <= toBar (${out.toBar})`);
  }
  if (tm.mono != null) out.mono = parseEnum<MonoPolicy>(tm.mono, MONO_POLICIES, `${prefix}.mono`);

  const isDrum = DRUM_TARGETS.has(target);
  if (tm.transpose != null) {
    if (isDrum) throw new Error(`${prefix}.transpose is only allowed on melodic targets`);
    if (typeof tm.transpose !== 'number' || !Number.isInteger(tm.transpose)) {
      throw new Error(`${prefix}.transpose must be an integer number of semitones; got ${JSON.stringify(tm.transpose)}`);
    }
    out.transpose = tm.transpose;
  }
  if (tm.fold != null) {
    if (isDrum) throw new Error(`${prefix}.fold is only allowed on melodic targets`);
    const fold = parseMidiNoteArray(tm.fold, `${prefix}.fold`);
    if (fold.length !== 2) {
      throw new Error(`${prefix}.fold must be [lo, hi]; got ${JSON.stringify(tm.fold)}`);
    }
    const [lo, hi] = fold as [number, number];
    if (hi - lo < 12) {
      throw new Error(`${prefix}.fold range must span at least 12 semitones (hi - lo >= 12); got [${lo}, ${hi}]`);
    }
    out.fold = [lo, hi];
  }
  if (tm.include != null) {
    if (!isDrum) throw new Error(`${prefix}.include is only allowed on noise or dmc targets`);
    out.include = parseMidiNoteArray(tm.include, `${prefix}.include`);
  }
  if (tm.exclude != null) {
    if (!isDrum) throw new Error(`${prefix}.exclude is only allowed on noise or dmc targets`);
    out.exclude = parseMidiNoteArray(tm.exclude, `${prefix}.exclude`);
  }
  return out;
}

function parseDutyCycle(raw: unknown, context: string): number {
  const n = parseFiniteNumber(raw, context);
  if (!DUTY_CYCLE_VALUES.has(n)) {
    throw new Error(`${context} must be one of 12.5|25|50|75; got ${JSON.stringify(raw)}`);
  }
  return n;
}

function parseWaveVolume(raw: unknown, context: string): number {
  const n = parseFiniteNumber(raw, context);
  if (!WAVE_VOLUME_VALUES.has(n)) {
    throw new Error(`${context} must be one of 0|25|50|100; got ${JSON.stringify(raw)}`);
  }
  return n;
}

function parseFiniteNumberArray(raw: unknown, context: string): number[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${context} must be an array of numbers or null; got ${JSON.stringify(raw)}`);
  }
  return raw.map((x, i) => parseFiniteNumber(x, `${context}[${i}]`));
}

function parseVolEnvArray(raw: unknown, context: string): number[] {
  return parseFiniteNumberArray(raw, context).map((n, i) => {
    if (!Number.isInteger(n) || n < 0 || n > 15) {
      throw new Error(`${context}[${i}] must be an integer in 0–15; got ${n}`);
    }
    return n;
  });
}

function parsePitchEnvArray(raw: unknown, context: string): number[] {
  return parseFiniteNumberArray(raw, context).map((n, i) => {
    if (!Number.isInteger(n)) {
      throw new Error(`${context}[${i}] must be an integer; got ${n}`);
    }
    return n;
  });
}

function parseFamilyArticulationConfig(
  raw: Record<string, unknown>,
  familyId: GmFamily,
): FamilyArticulationConfig {
  const out: FamilyArticulationConfig = {};
  if (raw.gb != null) {
    if (typeof raw.gb !== 'object' || Array.isArray(raw.gb)) {
      throw new Error(`families.${familyId}.gb must be an object`);
    }
    const g = raw.gb as Record<string, unknown>;
    const prefix = `families.${familyId}.gb`;
    out.gb = {};
    if (g.level != null) out.gb.level = parseIntInRange(g.level, 0, 15, `${prefix}.level`);
    if (g.period != null) out.gb.period = parseIntInRange(g.period, 0, 7, `${prefix}.period`);
    if (g.dutyP1 != null) out.gb.dutyP1 = parseDutyCycle(g.dutyP1, `${prefix}.dutyP1`);
    if (g.dutyP2 != null) out.gb.dutyP2 = parseDutyCycle(g.dutyP2, `${prefix}.dutyP2`);
    if (g.waveVolume != null) out.gb.waveVolume = parseWaveVolume(g.waveVolume, `${prefix}.waveVolume`);
  }
  if (raw.nes != null) {
    if (typeof raw.nes !== 'object' || Array.isArray(raw.nes)) {
      throw new Error(`families.${familyId}.nes must be an object`);
    }
    const n = raw.nes as Record<string, unknown>;
    const prefix = `families.${familyId}.nes`;
    out.nes = {};
    if (n.vol != null) out.nes.vol = parseIntInRange(n.vol, 0, 15, `${prefix}.vol`);
    if (n.dutyP1 != null) out.nes.dutyP1 = parseDutyCycle(n.dutyP1, `${prefix}.dutyP1`);
    if (n.dutyP2 != null) out.nes.dutyP2 = parseDutyCycle(n.dutyP2, `${prefix}.dutyP2`);
    if (n.volEnv === null) out.nes.volEnv = null;
    else if (n.volEnv != null) out.nes.volEnv = parseVolEnvArray(n.volEnv, `${prefix}.volEnv`);
    if (n.pitchEnvP1 === null) out.nes.pitchEnvP1 = null;
    else if (n.pitchEnvP1 != null) {
      out.nes.pitchEnvP1 = parsePitchEnvArray(n.pitchEnvP1, `${prefix}.pitchEnvP1`);
    }
  }
  return out;
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
  sectionBars?: number;
  strict?: boolean;
  title?: string;
  annotate?: boolean;
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
    drumFlamTicks:
      typeof cfg.drumFlamTicks === 'number'
        ? Math.max(0, Math.floor(cfg.drumFlamTicks))
        : base.drumFlamTicks,
    maxBars:
      typeof args.maxBars === 'number'
        ? Math.max(1, Math.floor(args.maxBars))
        : typeof cfg.maxBars === 'number'
          ? Math.max(1, Math.floor(cfg.maxBars))
          : undefined,
    sectionBars:
      typeof args.sectionBars === 'number'
        ? Math.max(0, Math.floor(args.sectionBars))
        : typeof cfg.sectionBars === 'number'
          ? Math.max(0, Math.floor(cfg.sectionBars))
          : base.sectionBars,
    strict: args.strict === true,
    trackMappings: Array.isArray(cfg.trackMappings) ? cfg.trackMappings : undefined,
    dmcReinforcement: {
      enabled: cfg.dmcReinforcement?.enabled === true,
      kickSample: cfg.dmcReinforcement?.kickSample ?? '@nes/kick',
      snareSample: cfg.dmcReinforcement?.snareSample ?? '@nes/snare',
    },
    programFamilyByProgram: buildProgramFamilyByProgram(cfg.programFamilies),
    familyArticulations: mergeFamilyArticulations(cfg.families),
    title: args.title ?? (typeof cfg.title === 'string' && cfg.title.trim() ? cfg.title.trim() : undefined),
    packing: cfg.packing ?? base.packing,
    unmappedTracks: cfg.unmappedTracks ?? base.unmappedTracks,
    bpm: cfg.bpm,
    tempo: cfg.tempo ?? base.tempo,
    startBar: cfg.startBar,
    endBar: cfg.endBar,
    nudge: cfg.nudge ?? base.nudge,
    annotate: args.annotate ?? cfg.annotate ?? base.annotate,
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
  if (o.title != null) {
    if (typeof o.title !== 'string' || !o.title.trim()) {
      throw new Error('title must be a non-empty string');
    }
    out.title = o.title.trim();
  }
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
  if (o.drumFlamTicks != null) {
    const n = Number(o.drumFlamTicks);
    if (!Number.isFinite(n) || n < 0) throw new Error('drumFlamTicks must be >= 0');
    out.drumFlamTicks = Math.floor(n);
  }
  if (o.maxBars != null) {
    const n = Number(o.maxBars);
    if (!Number.isFinite(n) || n < 1) throw new Error('maxBars must be >= 1');
    out.maxBars = Math.floor(n);
  }
  if (o.sectionBars != null) {
    const n = Number(o.sectionBars);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new Error('sectionBars must be an integer >= 0 (0 = monolithic)');
    }
    out.sectionBars = n;
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
  if (o.programFamilies != null) {
    if (typeof o.programFamilies !== 'object' || Array.isArray(o.programFamilies)) {
      throw new Error('programFamilies must be an object of { "0-7"|"40": "piano"|… }');
    }
    const pf: Record<string, string> = {};
    for (const [key, val] of Object.entries(o.programFamilies as Record<string, unknown>)) {
      parseProgramFamilyKey(key); // validate
      pf[key] = parseGmFamily(String(val), `programFamilies['${key}']`);
    }
    out.programFamilies = pf;
  }
  if (o.families != null) {
    if (typeof o.families !== 'object' || Array.isArray(o.families)) {
      throw new Error('families must be an object keyed by family id');
    }
    const fams: Partial<Record<GmFamily, FamilyArticulationConfig>> = {};
    for (const [key, val] of Object.entries(o.families as Record<string, unknown>)) {
      const id = parseGmFamily(key, `families['${key}']`);
      if (val == null || typeof val !== 'object' || Array.isArray(val)) {
        throw new Error(`families.${id} must be an object`);
      }
      fams[id] = parseFamilyArticulationConfig(val as Record<string, unknown>, id);
    }
    out.families = fams;
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
      const target = parseChipRole(tm.target, `trackMappings[${i}].target`);
      let midiChannel: number | undefined;
      if (tm.midiChannel != null) {
        midiChannel = parseMidiChannel(tm.midiChannel, `trackMappings[${i}].midiChannel`);
      }
      let instrument: string | undefined;
      if (typeof tm.instrument === 'string' && tm.instrument.length > 0) {
        instrument = parseBaxIdentifier(tm.instrument, `trackMappings[${i}].instrument`);
      }
      mappings.push({
        midiTrack: typeof tm.midiTrack === 'number' ? tm.midiTrack : undefined,
        midiChannel,
        target,
        instrument,
        drumMap:
          tm.drumMap && typeof tm.drumMap === 'object' && !Array.isArray(tm.drumMap)
            ? (tm.drumMap as Record<string, string>)
            : undefined,
        ...parseMappingArrangement(tm, target, `trackMappings[${i}]`),
      });
    }
    out.trackMappings = mappings;
  }
  if (o.packing != null) out.packing = parseEnum<PackingMode>(o.packing, PACKING_MODES, 'packing');
  if (o.unmappedTracks != null) {
    out.unmappedTracks = parseEnum<UnmappedTracksMode>(o.unmappedTracks, UNMAPPED_MODES, 'unmappedTracks');
  }
  if (o.bpm != null) {
    if (typeof o.bpm !== 'number' || !Number.isFinite(o.bpm) || o.bpm <= 0) {
      throw new Error(`bpm must be a number > 0; got ${JSON.stringify(o.bpm)}`);
    }
    out.bpm = o.bpm;
  }
  if (o.tempo != null) out.tempo = parseEnum<TempoPolicy>(o.tempo, TEMPO_POLICIES, 'tempo');
  if (o.startBar != null) out.startBar = parseIntegerAtLeast(o.startBar, 1, 'startBar');
  if (o.endBar != null) out.endBar = parseIntegerAtLeast(o.endBar, 1, 'endBar');
  if (out.startBar != null && out.endBar != null && out.endBar < out.startBar) {
    throw new Error(`endBar (${out.endBar}) must be >= startBar (${out.startBar})`);
  }
  if (o.nudge != null) {
    if (typeof o.nudge !== 'number' || !Number.isInteger(o.nudge)) {
      throw new Error(`nudge must be an integer number of sixteenths; got ${JSON.stringify(o.nudge)}`);
    }
    out.nudge = o.nudge;
  }
  if (o.annotate != null) {
    if (typeof o.annotate !== 'boolean') {
      throw new Error(`annotate must be true or false; got ${JSON.stringify(o.annotate)}`);
    }
    out.annotate = o.annotate;
  }
  return out;
}
