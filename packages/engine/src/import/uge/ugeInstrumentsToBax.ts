/**
 * Convert parsed hUGETracker instruments into BeatBax kit source (`inst` / `subpat`).
 */

import {
  HUGE_EFFECT_CHANGE_TIMBRE,
  HUGE_EFFECT_SET_VOLUME,
  ugeNoteToOffset,
} from '../../chips/gameboy/instrumentProgram.js';
import { UGE_EMPTY_NOTE } from '../../chips/gameboy/noiseNote.js';
import {
  ugeNoteToString,
  type DutyInstrument,
  type NoiseInstrument,
  type SubPatternCell,
  type UGESong,
  type WaveInstrument,
} from './uge.reader.js';

export type InstrumentKind = 'pulse' | 'wave' | 'noise';

export interface ExtractedInstrument {
  kind: InstrumentKind;
  name: string;
  source: string;
  originalName: string;
  instLine: string;
  subpatName?: string;
  subpatBlock?: string;
}

export interface RenameRecord {
  from: string;
  to: string;
  source: string;
}

export interface ExtractionResult {
  pulse: ExtractedInstrument[];
  wave: ExtractedInstrument[];
  noise: ExtractedInstrument[];
  renames: RenameRecord[];
}

export interface NameAllocator {
  used: Set<string>;
  allocate(base: string, source: string, originalName: string, renames: RenameRecord[]): string;
}

const RESERVED_IDENTS = new Set([
  'chip', 'bpm', 'scale', 'time', 'stepsPerBar', 'ticksPerStep', 'song',
  'inst', 'subpat', 'pat', 'seq', 'channel', 'effect', 'play', 'export',
]);

const PLACEHOLDER_NAME = /^(DUTY|WAVE|NOISE)_\d+$/i;
const DUTY_PERCENTS = [12.5, 25, 50, 75];
const WAVE_VOLUME_PERCENT: Record<number, number> = { 0: 0, 1: 100, 2: 50, 3: 25 };

/** Unused hUGETracker new-song starter names — skip unless the song actually uses the slot. */
const DEFAULT_STARTER_NAMES = new Set([
  'Duty 12.5%',
  'Duty 25%',
  'Duty 50%',
  'Duty 75%',
  'Duty 12.5% plink',
  'Duty 25% plink',
  'Duty 50% plink',
  'Duty 75% plink',
  'Square wave 12.5%',
  'Square wave 25%',
  'Square wave 50%',
  'Square wave 75%',
  'Sawtooth wave',
  'Triangle wave',
  'Sine wave',
  'Toothy',
  'Triangle Toothy',
  'Pointy',
  'Strange',
]);

export function createNameAllocator(): NameAllocator {
  const used = new Set<string>();
  return {
    used,
    allocate(base: string, source: string, originalName: string, renames: RenameRecord[]): string {
      let candidate = base;
      let n = 2;
      while (used.has(candidate.toLowerCase())) {
        candidate = `${base}_${n}`;
        n += 1;
      }
      used.add(candidate.toLowerCase());
      if (candidate !== base) {
        renames.push({ from: originalName || base, to: candidate, source });
      }
      return candidate;
    },
  };
}

export function sanitizeIdent(raw: string, fallback: string): string {
  let s = String(raw ?? '').trim().replace(/[^A-Za-z0-9_\-]+/g, '_');
  s = s.replace(/_+/g, '_').replace(/^_|_$/g, '');
  // Drop leading digits / leftover underscores until the ident starts with a letter.
  while (s && !/^[A-Za-z_]/.test(s)) {
    s = s.replace(/^[^A-Za-z_]+/, '').replace(/^_+/, '');
  }
  s = s.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!s || RESERVED_IDENTS.has(s) || !/^[A-Za-z_][A-Za-z0-9_\-]*$/.test(s)) return fallback;
  return s;
}

function isPlaceholderName(name: string): boolean {
  return PLACEHOLDER_NAME.test(name.trim());
}

function subpatternHasContent(rows: SubPatternCell[] | undefined): boolean {
  if (!rows || rows.length === 0) return false;
  return rows.some((r) => r.note !== UGE_EMPTY_NOTE || r.jump !== 0 || r.effectCode !== 0 || r.effectParam !== 0);
}

function collectUsedSlots(song: UGESong, order: number[]): Set<number> {
  const used = new Set<number>();
  const byIndex = new Map(song.patterns.map((p) => [p.index, p]));
  for (const idx of order) {
    const pat = byIndex.get(idx);
    if (!pat) continue;
    for (const cell of pat.rows) {
      if (cell.instrument > 0) used.add(cell.instrument - 1);
    }
  }
  return used;
}

function firstNoiseNote(song: UGESong, slot: number): string | undefined {
  const byIndex = new Map(song.patterns.map((p) => [p.index, p]));
  for (const idx of song.orders.noise) {
    const pat = byIndex.get(idx);
    if (!pat) continue;
    for (const cell of pat.rows) {
      if (cell.instrument === slot + 1 && cell.note !== UGE_EMPTY_NOTE) {
        const name = ugeNoteToString(cell.note);
        if (name !== '...' && name !== '???') return name;
      }
    }
  }
  return undefined;
}

function shouldInclude(
  name: string,
  used: boolean,
  subpatOn: boolean,
  rows: SubPatternCell[] | undefined,
): boolean {
  const trimmed = name.trim();
  if (used) return true;
  if (subpatOn && subpatternHasContent(rows)) return true;
  if (!trimmed || isPlaceholderName(trimmed)) return false;
  if (DEFAULT_STARTER_NAMES.has(trimmed)) return false;
  return true;
}

function formatEnv(initial: number, dir: number, change: number): string {
  const level = Math.max(0, Math.min(15, initial));
  if (!change) return `env=${level},flat,0`;
  const direction = dir === 0 ? 'up' : 'down';
  return `env=${level},${direction},${change}`;
}

function formatSubpatCell(cell: SubPatternCell, rowIndex: number): string {
  const emptyNote = cell.note === UGE_EMPTY_NOTE;
  const noFx = cell.effectCode === 0 && cell.effectParam === 0;
  const noJump = !cell.jump;
  if (emptyNote && noFx && noJump) return '.';

  const parts: string[] = [];
  const offset = ugeNoteToOffset(cell.note);
  if (offset !== null) {
    parts.push(offset >= 0 ? `+${offset}` : `${offset}`);
  }

  if (cell.effectCode === HUGE_EFFECT_SET_VOLUME) {
    parts.push(`vol:${cell.effectParam & 0x0f}`);
  } else if (cell.effectCode === HUGE_EFFECT_CHANGE_TIMBRE) {
    parts.push(`timbre:${cell.effectParam}`);
  } else if (cell.effectCode !== 0) {
    parts.push(`fx:${cell.effectCode},${cell.effectParam}`);
  }

  if (cell.jump === rowIndex + 1) {
    parts.push('halt');
  } else if (cell.jump > 0) {
    parts.push(`jump:${cell.jump}`);
  }

  return parts.length ? parts.join(' ') : '.';
}

export function formatSubpatternBlock(name: string, rows: SubPatternCell[]): string | undefined {
  if (!subpatternHasContent(rows)) return undefined;
  let last = -1;
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    if (c.note !== UGE_EMPTY_NOTE || c.jump !== 0 || c.effectCode !== 0 || c.effectParam !== 0) {
      last = i;
    }
  }
  if (last < 0) return undefined;
  const lines = [`subpat ${name} =`];
  for (let i = 0; i <= last; i++) {
    lines.push(`  ${formatSubpatCell(rows[i], i)}`);
  }
  return lines.join('\n');
}

function wavetableHex(song: UGESong, waveIndex: number): string {
  const idx = Math.max(0, Math.min(15, waveIndex | 0));
  const table = song.wavetables[idx] ?? [];
  const nibbles: number[] = [];
  for (let i = 0; i < 32; i++) {
    const n = table[i] ?? 0;
    nibbles.push(Math.max(0, Math.min(15, n)));
  }
  return nibbles.map((n) => n.toString(16).toUpperCase()).join('');
}

function formatDutyLine(name: string, inst: DutyInstrument, subpatName?: string): string {
  const duty = DUTY_PERCENTS[inst.dutyCycle] ?? 50;
  const parts = [
    `inst ${name} type=pulse1`,
    `duty=${duty}`,
    formatEnv(inst.initialVolume, inst.volumeSweepDir, inst.volumeSweepChange),
  ];
  if (inst.freqSweepTime > 0) {
    const dir = inst.sweepEnabled === 1 ? 'down' : 'up';
    const shift = Math.abs(inst.freqSweepShift);
    parts.push(`sweep=${inst.freqSweepTime},${dir},${shift}`);
  }
  if (inst.lengthEnabled && inst.length) parts.push(`length=${inst.length}`);
  if (subpatName) parts.push(`subpat=${subpatName}`);
  return parts.join(' ');
}

function formatWaveLine(name: string, inst: WaveInstrument, song: UGESong, subpatName?: string): string {
  const volume = WAVE_VOLUME_PERCENT[inst.volume] ?? 100;
  const parts = [
    `inst ${name} type=wave`,
    `wave="${wavetableHex(song, inst.waveIndex)}"`,
    `volume=${volume}`,
  ];
  if (inst.lengthEnabled && inst.length) parts.push(`length=${inst.length}`);
  if (subpatName) parts.push(`subpat=${subpatName}`);
  return parts.join(' ');
}

function formatNoiseLine(
  name: string,
  inst: NoiseInstrument,
  ugeNote: string | undefined,
  subpatName?: string,
): string {
  const width = inst.noiseMode === 1 ? 7 : 15;
  const parts = [
    `inst ${name} type=noise`,
    `gb:width=${width}`,
    formatEnv(inst.initialVolume, inst.volumeSweepDir, inst.volumeSweepChange),
  ];
  if (inst.lengthEnabled && inst.length) parts.push(`length=${inst.length}`);
  if (ugeNote) parts.push(`uge_note=${ugeNote}`);
  if (subpatName) parts.push(`subpat=${subpatName}`);
  return parts.join(' ');
}

function maybeSubpat(
  instName: string,
  enabled: boolean | undefined,
  rows: SubPatternCell[] | undefined,
  names: NameAllocator,
  source: string,
  renames: RenameRecord[],
): { subpatName?: string; subpatBlock?: string } {
  if (!enabled || !rows || !subpatternHasContent(rows)) return {};
  const subpatName = names.allocate(sanitizeIdent(`${instName}_sub`, `${instName}_sub`), source, `${instName}_sub`, renames);
  const subpatBlock = formatSubpatternBlock(subpatName, rows);
  if (!subpatBlock) return {};
  return { subpatName, subpatBlock };
}

export function extractInstrumentsFromUGE(
  song: UGESong,
  sourceLabel: string,
  names: NameAllocator,
  result: ExtractionResult,
): void {
  const usedDuty = new Set([
    ...collectUsedSlots(song, song.orders.duty1),
    ...collectUsedSlots(song, song.orders.duty2),
  ]);
  const usedWave = collectUsedSlots(song, song.orders.wave);
  const usedNoise = collectUsedSlots(song, song.orders.noise);

  song.dutyInstruments.forEach((inst, slot) => {
    if (!shouldInclude(inst.name, usedDuty.has(slot), !!inst.subpatternEnabled, inst.rows)) return;
    const fallback = `pulse_${result.pulse.length + 1}`;
    const base = sanitizeIdent(inst.name, fallback);
    const name = names.allocate(base, sourceLabel, inst.name, result.renames);
    const sub = maybeSubpat(name, inst.subpatternEnabled, inst.rows, names, sourceLabel, result.renames);
    result.pulse.push({
      kind: 'pulse',
      name,
      source: sourceLabel,
      originalName: inst.name,
      instLine: formatDutyLine(name, inst, sub.subpatName),
      subpatName: sub.subpatName,
      subpatBlock: sub.subpatBlock,
    });
  });

  song.waveInstruments.forEach((inst, slot) => {
    if (!shouldInclude(inst.name, usedWave.has(slot), !!inst.subpatternEnabled, inst.rows)) return;
    const fallback = `wave_${result.wave.length + 1}`;
    const base = sanitizeIdent(inst.name, fallback);
    const name = names.allocate(base, sourceLabel, inst.name, result.renames);
    const sub = maybeSubpat(name, inst.subpatternEnabled, inst.rows, names, sourceLabel, result.renames);
    result.wave.push({
      kind: 'wave',
      name,
      source: sourceLabel,
      originalName: inst.name,
      instLine: formatWaveLine(name, inst, song, sub.subpatName),
      subpatName: sub.subpatName,
      subpatBlock: sub.subpatBlock,
    });
  });

  song.noiseInstruments.forEach((inst, slot) => {
    if (!shouldInclude(inst.name, usedNoise.has(slot), !!inst.subpatternEnabled, inst.rows)) return;
    const fallback = `noise_${result.noise.length + 1}`;
    const base = sanitizeIdent(inst.name, fallback);
    const name = names.allocate(base, sourceLabel, inst.name, result.renames);
    const sub = maybeSubpat(name, inst.subpatternEnabled, inst.rows, names, sourceLabel, result.renames);
    result.noise.push({
      kind: 'noise',
      name,
      source: sourceLabel,
      originalName: inst.name,
      instLine: formatNoiseLine(name, inst, firstNoiseNote(song, slot), sub.subpatName),
      subpatName: sub.subpatName,
      subpatBlock: sub.subpatBlock,
    });
  });
}

export function emptyExtractionResult(): ExtractionResult {
  return { pulse: [], wave: [], noise: [], renames: [] };
}

function emitSection(title: string, items: ExtractedInstrument[]): string[] {
  const lines: string[] = [
    '',
    '# =============================================================================',
    `# ${title}`,
    '# =============================================================================',
  ];
  let lastSource = '';
  for (const item of items) {
    if (item.source !== lastSource) {
      lines.push('');
      lines.push(`# from: ${item.source}`);
      lastSource = item.source;
    }
    if (item.subpatBlock) {
      lines.push(item.subpatBlock);
    }
    lines.push(item.instLine);
  }
  return lines;
}

export function formatGameBoyIns(result: ExtractionResult): string {
  const header = [
    '# Game Boy instrument library extracted from hUGETracker .uge files.',
    '# Import with: import "local:gameboy.ins"',
    '# Grouped by type (pulse, wave, noise). Duplicate names were renamed _2, _3, …',
  ];
  return [
    ...header,
    ...emitSection('Pulse', result.pulse),
    ...emitSection('Wave', result.wave),
    ...emitSection('Noise', result.noise),
    '',
  ].join('\n');
}

const TOUR_CHUNK = 12;

function chunkTourSeqs(
  seqPrefix: string,
  patName: string,
  names: string[],
): { seqNames: string[]; lines: string[] } {
  const lines: string[] = [];
  const seqNames: string[] = [];
  if (names.length === 0) return { seqNames, lines };
  for (let i = 0; i < names.length; i += TOUR_CHUNK) {
    const chunk = names.slice(i, i + TOUR_CHUNK);
    const seqName = names.length <= TOUR_CHUNK ? seqPrefix : `${seqPrefix}_${Math.floor(i / TOUR_CHUNK)}`;
    seqNames.push(seqName);
    lines.push(`seq ${seqName} = ${chunk.map((n) => `${patName}:inst(${n})`).join(' ')}`);
  }
  return { seqNames, lines };
}

export function formatGameBoyInstrumentsDemo(result: ExtractionResult): string {
  const pulseNames = result.pulse.map((i) => i.name);
  const waveNames = result.wave.map((i) => i.name);
  const noiseNames = result.noise.map((i) => i.name);

  const pulseTour = chunkTourSeqs('pulse_tour', 'pulse_phrase', pulseNames);
  const waveTour = chunkTourSeqs('wave_tour', 'wave_phrase', waveNames);
  const noiseTour = chunkTourSeqs('noise_tour', 'noise_hit', noiseNames);

  const channels: string[] = [];
  if (pulseNames.length) {
    channels.push(`channel 1 => inst ${pulseNames[0]} seq ${pulseTour.seqNames.join(' ')}`);
  }
  if (waveNames.length) {
    channels.push(`channel 3 => inst ${waveNames[0]} seq ${waveTour.seqNames.join(' ')}`);
  }
  if (noiseNames.length) {
    channels.push(`channel 4 => inst ${noiseNames[0]} seq ${noiseTour.seqNames.join(' ')}`);
  }

  return [
    '# Game Boy instrument library tour — not a musical arrangement.',
    '# Imports every extracted patch from gameboy.ins and plays each once.',
    '# UGE export cannot fit this kit (15 slots per type); use BeatBax playback.',
    '',
    'song name "Game Boy Instrument Library Demo"',
    'song artist "BeatBax"',
    'song description """Audition tour of instruments extracted from hUGETracker .uge files in songs/instruments/gameboy/uge."""',
    'song tags "instruments,gameboy,library,demo"',
    '',
    'chip gameboy',
    'import "local:gameboy.ins"',
    'bpm 128',
    'stepsPerBar 4',
    '',
    'pat pulse_phrase = C4 E4 G4 C5',
    'pat wave_phrase  = C3 E3 G3 C4',
    'pat noise_hit    = C6',
    '',
    ...pulseTour.lines,
    ...waveTour.lines,
    ...noiseTour.lines,
    '',
    ...channels,
    '',
    'play auto',
    '',
  ].join('\n');
}

export function extractUgeInstrumentLibrary(
  files: { label: string; song: UGESong }[],
): { result: ExtractionResult; kit: string; demo: string } {
  const names = createNameAllocator();
  const result = emptyExtractionResult();
  for (const file of files) {
    extractInstrumentsFromUGE(file.song, file.label, names, result);
  }
  return {
    result,
    kit: formatGameBoyIns(result),
    demo: formatGameBoyInstrumentsDemo(result),
  };
}
