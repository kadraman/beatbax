/**
 * GM program family → chip instrument kit for MIDI conversion.
 */
import type {
  ChipRole,
  FamilyArticulation,
  FamilyArticulationConfig,
  GmFamily,
  MidiChipId,
  MidiConvertOptions,
  ProgramFamilyRange,
} from './types.js';
import { GM_FAMILIES } from './types.js';

export type { GmFamily };

const DRUM_NAMES = new Set(['kick', 'snare', 'hihat', 'shaker', 'ghost', 'crash']);

const FAMILY_SET = new Set<string>(GM_FAMILIES);

export const DEFAULT_PROGRAM_FAMILY_RANGES: readonly ProgramFamilyRange[] = [
  { min: 0, max: 7, family: 'piano' },
  { min: 24, max: 31, family: 'guitar' },
  { min: 32, max: 39, family: 'bass' },
  { min: 40, max: 51, family: 'strings' },
  { min: 80, max: 87, family: 'lead' },
  { min: 88, max: 95, family: 'pad' },
];

export const DEFAULT_FAMILY_ARTICULATIONS: Record<GmFamily, FamilyArticulation> = {
  piano: {
    gb: { level: 13, period: 2, dutyP1: 50, dutyP2: 12.5, waveVolume: 25 },
    nes: { vol: 10, dutyP1: 25, dutyP2: 50, volEnv: [12, 10, 8, 6, 4, 2, 1] },
  },
  guitar: {
    gb: { level: 12, period: 3, dutyP1: 25, dutyP2: 12.5, waveVolume: 25 },
    nes: { vol: 10, dutyP1: 25, dutyP2: 50, volEnv: [12, 10, 8, 6, 4, 2, 1] },
  },
  bass: {
    gb: { level: 12, period: 2, dutyP1: 50, dutyP2: 12.5, waveVolume: 25 },
    nes: { vol: 10, dutyP1: 25, dutyP2: 50, pitchEnvP1: [2, 1, 0, 0, 0, 0, 0, 0] },
  },
  strings: {
    gb: { level: 12, period: 0, dutyP1: 50, dutyP2: 50, waveVolume: 25 },
    nes: { vol: 10, dutyP1: 25, dutyP2: 50 },
  },
  pad: {
    gb: { level: 10, period: 0, dutyP1: 50, dutyP2: 50, waveVolume: 25 },
    nes: { vol: 8, dutyP1: 25, dutyP2: 50 },
  },
  lead: {
    gb: { level: 14, period: 3, dutyP1: 50, dutyP2: 12.5, waveVolume: 25 },
    nes: { vol: 10, dutyP1: 25, dutyP2: 50, pitchEnvP1: [2, 1, 0, 0, 0, 0, 0, 0] },
  },
};

const FAMILY_GM: Record<GmFamily, number> = {
  piano: 0,
  guitar: 24,
  bass: 39,
  strings: 40,
  pad: 89,
  lead: 81,
};

export function parseGmFamily(raw: string, context = 'family'): GmFamily {
  const v = String(raw).toLowerCase();
  if (!FAMILY_SET.has(v)) {
    throw new Error(`Invalid ${context} '${raw}'; expected piano|guitar|bass|strings|pad|lead`);
  }
  return v as GmFamily;
}

/** Parse `"40"` or `"40-51"` into inclusive bounds. */
export function parseProgramFamilyKey(key: string): { min: number; max: number } {
  const m = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(String(key).trim());
  if (!m) {
    throw new Error(
      `Invalid programFamilies key '${key}'; expected a GM program 0–127 or inclusive range like 40-51`,
    );
  }
  const min = Number(m[1]);
  const max = m[2] != null ? Number(m[2]) : min;
  if (min < 0 || max > 127 || min > max) {
    throw new Error(`Invalid programFamilies range '${key}'; programs must satisfy 0 ≤ min ≤ max ≤ 127`);
  }
  return { min, max };
}

/** Build 128-slot table: defaults then config overlays (config wins). */
export function buildProgramFamilyByProgram(
  overrides?: Record<string, string> | null,
): GmFamily[] {
  const table: GmFamily[] = Array.from({ length: 128 }, () => 'lead' as GmFamily);
  for (const r of DEFAULT_PROGRAM_FAMILY_RANGES) {
    for (let i = r.min; i <= r.max; i++) table[i] = r.family;
  }
  if (overrides) {
    for (const [key, famRaw] of Object.entries(overrides)) {
      const family = parseGmFamily(famRaw, `programFamilies['${key}']`);
      const { min, max } = parseProgramFamilyKey(key);
      for (let i = min; i <= max; i++) table[i] = family;
    }
  }
  return table;
}

function cloneArticulations(): Record<GmFamily, FamilyArticulation> {
  const out = {} as Record<GmFamily, FamilyArticulation>;
  for (const id of GM_FAMILIES) {
    const src = DEFAULT_FAMILY_ARTICULATIONS[id];
    out[id] = {
      gb: { ...src.gb },
      nes: {
        ...src.nes,
        volEnv: src.nes.volEnv ? [...src.nes.volEnv] : undefined,
        pitchEnvP1: src.nes.pitchEnvP1 ? [...src.nes.pitchEnvP1] : undefined,
      },
    };
  }
  return out;
}

export function mergeFamilyArticulations(
  overrides?: Partial<Record<GmFamily, FamilyArticulationConfig>> | null,
): Record<GmFamily, FamilyArticulation> {
  const out = cloneArticulations();
  if (!overrides) return out;
  for (const id of GM_FAMILIES) {
    const o = overrides[id];
    if (!o) continue;
    if (o.gb) {
      if (o.gb.level != null) out[id].gb.level = clampInt(o.gb.level, 0, 15);
      if (o.gb.period != null) out[id].gb.period = clampInt(o.gb.period, 0, 7);
      if (o.gb.dutyP1 != null) out[id].gb.dutyP1 = o.gb.dutyP1;
      if (o.gb.dutyP2 != null) out[id].gb.dutyP2 = o.gb.dutyP2;
      if (o.gb.waveVolume != null) out[id].gb.waveVolume = o.gb.waveVolume;
    }
    if (o.nes) {
      if (o.nes.vol != null) out[id].nes.vol = clampInt(o.nes.vol, 0, 15);
      if (o.nes.dutyP1 != null) out[id].nes.dutyP1 = o.nes.dutyP1;
      if (o.nes.dutyP2 != null) out[id].nes.dutyP2 = o.nes.dutyP2;
      if (o.nes.volEnv === null) delete out[id].nes.volEnv;
      else if (Array.isArray(o.nes.volEnv)) out[id].nes.volEnv = o.nes.volEnv.map((n) => clampInt(n, 0, 15));
      if (o.nes.pitchEnvP1 === null) delete out[id].nes.pitchEnvP1;
      else if (Array.isArray(o.nes.pitchEnvP1)) out[id].nes.pitchEnvP1 = [...o.nes.pitchEnvP1];
    }
  }
  return out;
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/** Map GM program number to a coarse timbre family. */
export function gmFamilyFromProgram(
  program: number,
  programFamilyByProgram?: readonly GmFamily[],
): GmFamily {
  const p = Number.isFinite(program) ? Math.floor(program) : 0;
  const idx = Math.max(0, Math.min(127, p));
  if (programFamilyByProgram && programFamilyByProgram.length === 128) {
    return programFamilyByProgram[idx] ?? 'lead';
  }
  return buildProgramFamilyByProgram()[idx] ?? 'lead';
}

function roleSuffix(role: ChipRole): '_p1' | '_p2' | '_bass' | null {
  if (role === 'pulse1') return '_p1';
  if (role === 'pulse2') return '_p2';
  if (role === 'wave' || role === 'triangle') return '_bass';
  return null;
}

/**
 * Deterministic instrument name for a GM family packed onto a chip role.
 * Bass-family on the bass role stays `bass`; drums keep percussion token names.
 */
export function instrumentNameForFamilyRole(family: GmFamily, role: ChipRole): string {
  if (role === 'noise') return 'hihat';
  if (role === 'dmc') return 'kick';
  const suffix = roleSuffix(role);
  if (!suffix) return family;
  if (family === 'bass' && suffix === '_bass') return 'bass';
  return `${family}${suffix}`;
}

/** Parse `{family}_p1|_p2|_bass` or bare `bass` / known drum names. */
export function parseFamilyRoleFromInstrumentName(
  name: string,
): { family: GmFamily; role: ChipRole } | null {
  if (DRUM_NAMES.has(name)) return null;
  if (name === 'bass') return { family: 'bass', role: 'wave' };
  const m = /^(piano|guitar|bass|strings|pad|lead)_(p1|p2|bass)$/.exec(name);
  if (!m) return null;
  const family = m[1] as GmFamily;
  const role: ChipRole = m[2] === 'p1' ? 'pulse1' : m[2] === 'p2' ? 'pulse2' : 'wave';
  return { family, role };
}

function gbEnv(level: number, period: number): string {
  return `env={"level":${level},"direction":"down","period":${period},"format":"gb"}`;
}

function artFor(
  options: MidiConvertOptions | undefined,
  family: GmFamily,
): FamilyArticulation {
  return options?.familyArticulations?.[family] ?? DEFAULT_FAMILY_ARTICULATIONS[family];
}

function gbPulseLine(
  name: string,
  type: 'pulse1' | 'pulse2',
  family: GmFamily,
  gm: number,
  options?: MidiConvertOptions,
): string {
  const a = artFor(options, family).gb;
  const duty = type === 'pulse1' ? a.dutyP1 : a.dutyP2;
  return `inst ${name} type=${type} duty=${duty} ${gbEnv(a.level, a.period)} gm=${gm}`;
}

function gbWaveBassLine(
  name: string,
  family: GmFamily,
  gm: number,
  options?: MidiConvertOptions,
): string {
  const volume = artFor(options, family).gb.waveVolume;
  return `inst ${name} type=wave volume=${volume} wave=[0,5,11,15,15,15,15,15,11,5,0,0,0,0,0,0,0,0,6,8,8,8,8,8,8,8,8,6,0,0,0,0] gm=${gm}`;
}

function nesPulseLine(
  name: string,
  type: 'pulse1' | 'pulse2',
  family: GmFamily,
  gm: number,
  options?: MidiConvertOptions,
): string {
  const a = artFor(options, family).nes;
  const duty = type === 'pulse1' ? a.dutyP1 : a.dutyP2;
  const parts = [`inst ${name} type=${type} duty=${duty} vol=${a.vol}`];
  if (a.volEnv && a.volEnv.length > 0) parts.push(`vol_env=[${a.volEnv.join(',')}]`);
  if (type === 'pulse1' && a.pitchEnvP1 && a.pitchEnvP1.length > 0) {
    parts.push(`pitch_env=[${a.pitchEnvP1.join(',')}]`);
  }
  parts.push(`gm=${gm}`);
  return parts.join(' ');
}

function nesTriangleBassLine(name: string, family: GmFamily, gm: number): string {
  void family;
  return `inst ${name} type=triangle pitch_env=[1,0,0,0,0,0,0,0] gm=${gm}`;
}

function resolveFamilyAndRole(
  name: string,
  fallbackRole: ChipRole,
  fallbackFamily: GmFamily,
): { family: GmFamily; role: ChipRole } {
  const parsed = parseFamilyRoleFromInstrumentName(name);
  if (parsed) {
    if (parsed.role === 'wave' && (fallbackRole === 'triangle' || fallbackRole === 'wave')) {
      return { family: parsed.family, role: fallbackRole };
    }
    return parsed;
  }
  return { family: fallbackFamily, role: fallbackRole };
}

/** Emit one melodic `inst` line for a named instrument on a chip role. */
export function emitMelodicInstLine(
  chip: MidiChipId,
  name: string,
  role: ChipRole,
  familyHint: GmFamily = 'lead',
  options?: MidiConvertOptions,
): string {
  const { family, role: r0 } = resolveFamilyAndRole(name, role, familyHint);
  let r = r0;
  if (chip === 'nes' && r === 'wave') r = 'triangle';
  if (chip === 'gameboy' && r === 'triangle') r = 'wave';
  const gm = FAMILY_GM[family];

  if (r === 'pulse1' || r === 'pulse2') {
    return chip === 'nes'
      ? nesPulseLine(name, r, family, gm, options)
      : gbPulseLine(name, r, family, gm, options);
  }
  if (chip === 'nes') return nesTriangleBassLine(name, family, gm);
  return gbWaveBassLine(name, family, gm, options);
}

function gbDrumLines(): string[] {
  return [
    'inst kick  type=noise gb:width=7 env={"level":14,"direction":"down","period":1,"format":"gb"} length=16 uge_note=C-6 pitch_env=[0,-2,-4,-6] vol_env=[15,12,8,4]',
    'inst snare type=noise gb:width=7 env={"level":12,"direction":"down","period":1,"format":"gb"} length=16 uge_note=C-7 pitch_env=[0,5,0] vol_env=[12,10,6,2]',
    'inst hihat type=noise gb:width=15 env={"level":5,"direction":"down","period":1,"format":"gb"} length=8 uge_note=C-8 vol_env=[6,2]',
    'inst shaker type=noise gb:width=15 env={"level":4,"direction":"down","period":1,"format":"gb"} length=4 uge_note=D-7 vol_env=[4,1]',
  ];
}

function nesDrumLines(options: MidiConvertOptions): string[] {
  const lines = [
    'inst hihat type=noise noise_mode=normal noise_period=2 vol_env=[7,4,2,1] note=C5',
    'inst ghost type=noise noise_mode=normal noise_period=7 vol_env=[5,4,3,2,1] note=C5',
    'inst crash type=noise noise_mode=normal noise_period=3 vol_env=[12,11,10,9,8,7,6,5,4,3,2,1] note=C5',
  ];
  if (options.dmcReinforcement.enabled) {
    const kick = options.dmcReinforcement.kickSample ?? '@nes/kick';
    const snare = options.dmcReinforcement.snareSample ?? '@nes/snare';
    lines.push(`inst kick   type=dmc dmc_rate=15 dmc_loop=false dmc_sample="${kick}"`);
    lines.push(`inst snare  type=dmc dmc_rate=15 dmc_loop=false dmc_sample="${snare}"`);
  } else {
    lines.push(
      'inst kick  type=noise noise_mode=normal noise_period=12 vol_env=[15,14,12,9,6,4,2,1] note=C5',
    );
    lines.push(
      'inst snare type=noise noise_mode=normal noise_period=7 vol_env=[14,13,11,9,7,5,3,2,1] note=C5',
    );
  }
  return lines;
}

export interface MelodicKitNeed {
  name: string;
  role: ChipRole;
  family: GmFamily;
}

/**
 * Emit kit lines: used melodic instruments (sorted) then full percussion kit.
 */
export function emitKitLines(
  chip: MidiChipId,
  options: MidiConvertOptions,
  melodicNeeds: MelodicKitNeed[] = [],
): string[] {
  const byName = new Map<string, MelodicKitNeed>();
  for (const n of melodicNeeds) {
    if (DRUM_NAMES.has(n.name)) continue;
    if (!byName.has(n.name)) byName.set(n.name, n);
  }
  const melodic = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = [];
  for (const m of melodic) {
    lines.push(emitMelodicInstLine(chip, m.name, m.role, m.family, options));
  }
  if (chip === 'nes') lines.push(...nesDrumLines(options));
  else lines.push(...gbDrumLines());
  return lines;
}

/** Instrument names that must appear for named drum tokens. */
export function requiredDrumInstruments(): string[] {
  return ['kick', 'snare', 'hihat'];
}
