import { noteToMidi, midiToNote } from '../util/music.js';
import type {
  AST,
  ChannelNode,
  ParseDiagnostic,
  ScaleDirective,
  ScaleEnforcement,
  ScaleLock,
  SourceLocation,
} from './ast.js';

const SCALE_MODES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const VALID_LOCKS: Set<string> = new Set(['scale', 'root+fifth', 'chord', 'chord7', 'octaves']);

const LOCK_DEGREES: Record<ScaleLock, number[] | 'root-only'> = {
  scale: [1, 2, 3, 4, 5, 6, 7],
  'root+fifth': [1, 5],
  chord: [1, 3, 5],
  chord7: [1, 3, 5, 7],
  octaves: 'root-only',
};

const ROOT_ALIASES: Record<string, string> = {
  DB: 'C#',
  EB: 'D#',
  FB: 'E',
  GB: 'F#',
  AB: 'G#',
  BB: 'A#',
  CB: 'B',
};

export function canonicalizeRoot(root: string): string | null {
  const raw = String(root ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^([A-Ga-g])([#bB]?)$/);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  const accidental = match[2] ? (match[2].toLowerCase() === 'b' ? 'B' : '#') : '';
  const key = `${letter}${accidental}`;
  if (ROOT_ALIASES[key]) return ROOT_ALIASES[key];
  const midi = noteToMidi(`${letter}${accidental === 'B' ? 'b' : accidental}4`);
  if (midi === null) return null;
  return midiToNote(midi).replace(/-?\d+$/, '');
}

export function normalizeScaleDirective(
  root: string,
  mode: string,
  enforcement?: string,
): ScaleDirective | null {
  const canonicalRoot = canonicalizeRoot(root);
  if (!canonicalRoot) return null;
  const normalizedMode = String(mode ?? '').trim().toLowerCase();
  if (!SCALE_MODES[normalizedMode]) return null;
  const e = String(enforcement ?? 'warn').trim().toLowerCase();
  const normalizedEnforcement: ScaleEnforcement =
    e === 'error' || e === 'off' ? (e as ScaleEnforcement) : 'warn';
  return { root: canonicalRoot, mode: normalizedMode, enforcement: normalizedEnforcement };
}

export function buildScalePitchClasses(root: string, mode: string): Set<number> | null {
  const canonicalRoot = canonicalizeRoot(root);
  const intervals = SCALE_MODES[String(mode ?? '').trim().toLowerCase()];
  if (!canonicalRoot || !intervals) return null;
  const rootMidi = noteToMidi(`${canonicalRoot}4`);
  if (rootMidi === null) return null;
  const rootPc = ((rootMidi % 12) + 12) % 12;
  return new Set(intervals.map((interval) => (rootPc + interval) % 12));
}

export function normalizeLock(rawLock: string | undefined): ScaleLock | undefined {
  const lock = String(rawLock ?? '').trim().toLowerCase();
  if (!lock || !VALID_LOCKS.has(lock)) return undefined;
  return lock as ScaleLock;
}

function pitchClassSetToNames(pitchClasses: Set<number>): string {
  return Array.from(pitchClasses)
    .sort((a, b) => a - b)
    .map((pc) => midiToNote(60 + pc).replace(/-?\d+$/, ''))
    .join(', ');
}

function buildLockPitchClasses(scale: ScaleDirective, lock: ScaleLock): Set<number> | null {
  const scaleSet = buildScalePitchClasses(scale.root, scale.mode);
  if (!scaleSet) return null;
  if (lock === 'scale') return scaleSet;
  if (lock === 'octaves') {
    const rootMidi = noteToMidi(`${scale.root}4`);
    if (rootMidi === null) return null;
    return new Set([((rootMidi % 12) + 12) % 12]);
  }
  const intervals = SCALE_MODES[scale.mode] ?? [];
  const degrees = LOCK_DEGREES[lock];
  if (!Array.isArray(degrees)) return scaleSet;
  const rootMidi = noteToMidi(`${scale.root}4`);
  if (rootMidi === null) return null;
  const rootPc = ((rootMidi % 12) + 12) % 12;
  const out = new Set<number>();
  for (const degree of degrees) {
    const i = intervals[degree - 1];
    if (i !== undefined) out.add((rootPc + i) % 12);
  }
  return out.size > 0 ? out : scaleSet;
}

function extractBaseName(token: string): string {
  return token.split(':')[0].trim().replace(/\s*\*\s*\d+$/, '');
}

function getReferencedPatternNames(ast: AST, channel: ChannelNode): Set<string> {
  const names = new Set<string>();
  const rawTokens: string[] = Array.isArray((channel as any).seqSpecTokens)
    ? ((channel as any).seqSpecTokens as string[])
    : typeof channel.pat === 'string'
      ? channel.pat.split(/[\s,]+/)
      : [];
  for (const rawToken of rawTokens) {
    const base = extractBaseName(rawToken);
    if (!base) continue;
    if (ast.pats[base]) {
      names.add(base);
      continue;
    }
    const seq = ast.seqs[base];
    if (!seq) continue;
    for (const seqToken of seq) {
      const seqBase = extractBaseName(seqToken);
      if (seqBase && ast.pats[seqBase]) names.add(seqBase);
    }
  }
  return names;
}

function levelForEnforcement(enforcement: ScaleEnforcement): ParseDiagnostic['level'] | null {
  if (enforcement === 'off') return null;
  return enforcement === 'error' ? 'error' : 'warning';
}

export function validateScaleLocks(ast: AST): ParseDiagnostic[] {
  const diagnostics: ParseDiagnostic[] = [];
  const scale = ast.scale;
  if (!scale) return diagnostics;

  const severity = levelForEnforcement(scale.enforcement);
  if (!severity) return diagnostics;

  const normalizedScale = normalizeScaleDirective(scale.root, scale.mode, scale.enforcement);
  if (!normalizedScale) return diagnostics;

  for (const ch of ast.channels ?? []) {
    const rawLock = (ch as any).lock as string | undefined;
    if (!rawLock) continue;

    const lock = normalizeLock(rawLock);
    if (!lock) {
      diagnostics.push({
        level: 'error',
        component: 'scale-lock',
        message: `Channel ${ch.id}: unknown lock '${rawLock}'. Valid locks: scale, root+fifth, chord, chord7, octaves.`,
        loc: ch.loc,
      });
      continue;
    }

    const instName = ch.inst;
    const instType = instName ? String((ast.insts as any)?.[instName]?.type ?? '').toLowerCase() : '';
    if (instType === 'noise') continue;

    const allowed = buildLockPitchClasses(normalizedScale, lock);
    if (!allowed) continue;
    const allowedNames = pitchClassSetToNames(allowed);
    const patternNames = getReferencedPatternNames(ast, ch);
    for (const patternName of patternNames) {
      const events = ast.patternEvents?.[patternName] ?? [];
      for (const ev of events) {
        if (!ev || ev.kind !== 'note') continue;
        const midi = noteToMidi(ev.value);
        if (midi === null) continue;
        const pitchClass = ((midi % 12) + 12) % 12;
        if (allowed.has(pitchClass)) continue;
        diagnostics.push({
          level: severity,
          component: 'scale-lock',
          message: `Note ${ev.value} is outside the declared lock "${lock}" for channel ${ch.id} (${normalizedScale.root} ${normalizedScale.mode} ${lock} = ${allowedNames}).`,
          loc: ev.loc as SourceLocation | undefined,
        });
      }
    }
  }

  return diagnostics;
}
