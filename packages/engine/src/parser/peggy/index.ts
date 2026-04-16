import { parse as peggyParse } from './generated/parser.js';
import { expandPattern, transposePattern } from '../../patterns/expand.js';
import { chipRegistry } from '../../chips/registry.js';
import {
  AST,
  ChannelNode,
  ParseError,
  ParseResult,
  InstMap,
  ParseDiagnostic,
  PatternEvent,
  PatternEventMap,
  PlayNode,
  SequenceItem,
  SequenceItemMap,
  SequenceTransform,
  SeqMap,
  SourceLocation,
  SongMetadata,
} from '../ast.js';
import {
  RawSeqItem,
  RawSeqModifier,
  materializeSequenceItems,
  normalizeSeqItems,
  parseSeqTransforms,
  patternEventsToTokens,
} from '../structured.js';
import { parseSweep } from '../../chips/gameboy/pulse.js';
import { warn } from '../../util/diag.js';
import { applyModsToTokens } from '../../expand/refExpander.js';
import { createLogger } from '../../util/logger.js';

const log = createLogger('parser');

// Reset per-parse run; `parseWithPeggy` will reset this at start of each parse.
let _csvNormalizationWarned = false;

const isInstNormalizationEnabled = (): boolean => {
  try {
    const env = typeof process !== 'undefined' && (process as any)?.env ? (process as any).env : undefined;
    const val = env?.BEATBAX_PEGGY_NORMALIZE_INST_PROPS ?? env?.beatbax_peggy_normalize_inst_props;
    if (val === undefined || val === null) return false; // default off for parity
    const s = String(val).toLowerCase();
    if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
  } catch {
    return false;
  }
};

function parseEnvelopeValue(v: any, vendorParam?: string): any | null {
  if (v == null) return null;
  // Already an object
  if (typeof v === 'object') {
    const level = Number(v.level ?? v.l ?? v[0]);
    const dir = (v.direction || v.dir || v[1] || 'none');
    const period = Number(v.period ?? v.p ?? v[2] ?? 0);
    if (!Number.isNaN(level)) {
      const direction = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'none';
      const out: any = { level: Math.max(0, Math.min(15, Math.floor(level))), direction, period: Math.max(0, Math.floor(period)) };
      if (vendorParam) out.format = vendorParam;
      return out;
    }
    return null;
  }

  // CSV-ish string like "15,down,7" or just "10,down"
  if (typeof v === 'string') {
    let s = v.trim();
    // detect vendor prefix on value (e.g., 'gb:12,down,1')
    let vendor = vendorParam || null;
    const pref = s.match(/^([a-z]+):/i);
    if (pref) { vendor = String(pref[1]).toLowerCase(); s = s.replace(/^[a-z]+:/i, '').trim(); }
    if (s.indexOf(',') >= 0) {
      const parts = s.split(',').map(p => p.trim()).filter(Boolean);
      const level = parts[0] ? parseInt(parts[0], 10) : NaN;
      const dir = parts[1] ? parts[1].toLowerCase() : 'none';
      const period = parts[2] ? parseInt(parts[2], 10) : 0;
      if (!Number.isNaN(level)) {
        if (!_csvNormalizationWarned) {
          warn('parser', `Deprecated: env=${s} parsed and normalized to object. Prefer env={"level":${level},"direction":"${dir}","period":${period}}`);
          _csvNormalizationWarned = true;
        }
        const direction = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'none';
        const out: any = { level: Math.max(0, Math.min(15, Math.floor(level))), direction, period: Math.max(0, Math.floor(period)) };
        if (vendor) out.format = vendor;
        return out;
      }
    }
  }
  return null;
}

function parseNoiseValue(v: any, vendorParam?: string): any | null {
  if (v == null) return null;
  if (typeof v === 'object') {
    const out = Object.assign({}, v);
    if (vendorParam) out.format = vendorParam;
    return out;
  }
  if (typeof v === 'string') {
    let s = v.trim();
    let vendor = vendorParam || null;
    const pref = s.match(/^([a-z]+):/i);
    if (pref) { vendor = String(pref[1]).toLowerCase(); s = s.replace(/^[a-z]+:/i, '').trim(); }
      if (s.indexOf(',') >= 0) {
      const parts = s.split(',').map(p => p.trim()).filter(Boolean);
      const clockShift = parts[0] ? parseInt(parts[0], 10) : undefined;
      const widthMode = parts[1] ? Number(parts[1]) : undefined;
      const divisor = parts[2] ? parseInt(parts[2], 10) : undefined;
      if (!_csvNormalizationWarned) {
        warn('parser', `Deprecated: noise=${s} parsed and normalized to object.`);
        _csvNormalizationWarned = true;
      }
      const out: any = {};
      if (!Number.isNaN(clockShift)) out.clockShift = clockShift;
      if (widthMode === 7 || widthMode === 15) out.widthMode = widthMode as 7 | 15;
      if (!Number.isNaN(divisor)) out.divisor = divisor;
      if (vendor) out.format = vendor;
      return out;
    }
  }
  return null;
}

interface BaseStmt { nodeType: string; loc?: SourceLocation }
interface ChipStmt extends BaseStmt { nodeType: 'ChipStmt'; chip: string }
interface BpmStmt extends BaseStmt { nodeType: 'BpmStmt'; bpm: number }
interface VolumeStmt extends BaseStmt { nodeType: 'VolumeStmt'; volume: number }
interface TimeStmt extends BaseStmt { nodeType: 'TimeStmt'; time: number }
interface StepsPerBarStmt extends BaseStmt { nodeType: 'StepsPerBarStmt'; stepsPerBar: number }
interface TicksPerStepStmt extends BaseStmt { nodeType: 'TicksPerStepStmt'; ticksPerStep: number }
interface SongMetaStmt extends BaseStmt { nodeType: 'SongMetaStmt'; key: string; value: string }
interface ImportStmt extends BaseStmt { nodeType: 'ImportStmt'; source: string }
interface InstStmt extends BaseStmt { nodeType: 'InstStmt'; name: string; rhs: string }
interface EffectStmt extends BaseStmt { nodeType: 'EffectStmt'; name: string; rhs?: string }
interface PatStmt extends BaseStmt { nodeType: 'PatStmt'; name: string; rhsEvents?: PatternEvent[]; rhsTokens?: string[]; rhs?: string }
interface SeqStmt extends BaseStmt { nodeType: 'SeqStmt'; name: string; rhsItems?: RawSeqItem[]; rhsTokens?: string[]; rhs?: string }
interface ArrangeStmt extends BaseStmt { nodeType: 'ArrangeStmt'; name: string; arrangements: (string | null)[][]; defaults?: string | null }
interface ChannelStmt extends BaseStmt { nodeType: 'ChannelStmt'; channel: number; rhs: string }
interface PlayStmt extends BaseStmt { nodeType: 'PlayStmt'; args: string }
interface ExportStmt extends BaseStmt { nodeType: 'ExportStmt'; format: string; path: string }
interface ErrorStmt extends BaseStmt { nodeType: 'ErrorStmt'; raw: string }

type Statement =
  | ChipStmt
  | BpmStmt
  | VolumeStmt
  | TimeStmt
  | StepsPerBarStmt
  | TicksPerStepStmt
  | SongMetaStmt
  | ImportStmt
  | InstStmt
  | EffectStmt
  | PatStmt
  | SeqStmt
  | ArrangeStmt
  | ChannelStmt
  | PlayStmt
  | ExportStmt
  | ErrorStmt;

interface ProgramNode {
  nodeType: 'Program';
  body: Statement[];
}

const warnProblematicPatternName = (name: string, loc?: SourceLocation | null): void => {
  const isSingleLetterNote = /^[A-Ga-g]$/.test(name);
  const isNoteWithOctave = /^[A-Ga-g][#b]?-?\d+$/.test(name);

  if (isSingleLetterNote || isNoteWithOctave) {
    warn('parser', `Pattern name '${name}' may be confused with a note name. Consider using a more descriptive name like '${name}_pattern' or '${name}_pat'.`, { loc });
  }
};
const parseInstRhs = (name: string, rhs: string, insts: InstMap, loc?: SourceLocation | null): void => {
  const rest = rhs.trim();
  const parts = rest.split(/\s+/);
  const props: Record<string, any> = {};
  const vendors: Record<string, string | null> = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq >= 0) {
      let k: string = p.slice(0, eq);
      let v: string = p.slice(eq + 1);
      // detect vendor prefix on key (e.g. gb:env or gb:width)
      const km = String(k).match(/^([a-z]+):(.*)$/i);
      if (km) {
        vendors[km[2]] = String(km[1]).toLowerCase();
        k = km[2];
      } else {
        vendors[k] = null;
      }
      if (v.startsWith('{') && v.endsWith('}')) {
        try {
          props[k] = JSON.parse(v);
        } catch (e) {
          props[k] = v;
        }
      } else {
        // Strip surrounding quotes so dmc_sample="@nes/bass" and dmc_sample=@nes/bass are equivalent
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        props[k] = v;
      }
    } else if (p.trim()) {
      props[p] = 'true';
    }
  }
  // Preserve previous behavior: always parse/normalize `sweep` (backcompat).
  try {
    if (props.sweep) {
      // strip vendor prefix on sweep value if present before parsing
      if (typeof props.sweep === 'string') {
        const m = String(props.sweep).match(/^([a-z]+):/i);
        if (m) props.sweep = String(props.sweep).replace(/^[a-z]+:/i, '');
      }
      const parsed = parseSweep(props.sweep as any);
      if (parsed) props.sweep = parsed as any;
    }
  } catch (e) {
    // keep original value
  }

  // Normalize long-form `envelope` => `env` so the AST uses the canonical key.
  try {
    if (props.envelope && props.env === undefined) {
      props.env = props.envelope;
      delete props.envelope;
    }
  } catch (e) {
    // keep original
  }

  // Normalize `env` and `noise` when explicit instrument normalization flag is set.
  if (isInstNormalizationEnabled()) {
    try {
      if (props.env) {
        const vendor = vendors['env'] ?? null;
        const parsed = parseEnvelopeValue(props.env as any, vendor ?? undefined);
        if (parsed) props.env = parsed;
      }
    } catch (e) {
      // keep original
    }

    try {
      if (props.noise) {
        const vendor = vendors['noise'] ?? null;
        const parsed = parseNoiseValue(props.noise as any, vendor ?? undefined);
        if (parsed) props.noise = parsed;
      }
    } catch (e) {
      // keep original
    }
    // Handle `width` vendor prefix on key/value (e.g., gb:width=7 or width=gb:7)
    try {
      if (props.width) {
        const vendor = vendors['width'] ?? null;
        if (typeof props.width === 'string') {
          let s = props.width;
          const m = String(s).match(/^([a-z]+):/i);
          if (m) {
            const vf = String(m[1]).toLowerCase();
            s = s.replace(/^[a-z]+:/i, '').trim();
            const n = parseInt(s, 10);
            if (!Number.isNaN(n)) props.width = { value: n, format: vf };
          } else if (vendor) {
            const n = parseInt(s, 10);
            if (!Number.isNaN(n)) props.width = { value: n, format: vendor };
          } else if (/^\d+$/.test(s)) {
            props.width = parseInt(s, 10);
          }
        } else if (typeof props.width === 'object' && vendor) {
          props.width.format = props.width.format || vendor;
        }
      }
    } catch (e) {
      // keep original
    }
  }

  if (loc) props.__loc = loc;
  insts[name] = props;
};

const expandPatternSpec = (nameSpec: string, rhsRaw?: string, rhsTokens?: string[], rhsEvents?: PatternEvent[], loc?: SourceLocation | null): { name: string; tokens: string[] } => {
  let tokens = rhsTokens ? rhsTokens.slice() : undefined;
  if (!tokens && rhsEvents && rhsEvents.length > 0) {
    tokens = patternEventsToTokens(rhsEvents);
  }

  let rhs = rhsRaw ? rhsRaw.trim() : '';
  if (tokens === undefined) {
    if ((rhs.startsWith('"') && rhs.endsWith('"')) || (rhs.startsWith("'") && rhs.endsWith("'"))) {
      rhs = rhs.slice(1, -1);
    }
  }

  const parts = nameSpec.split(':');
  const baseName = parts[0];
  const mods = parts.slice(1);

  warnProblematicPatternName(baseName, loc);

  try {
    let expanded = tokens ?? expandPattern(rhs);
    if (mods.length > 0) {
      let semitones = 0;
      let octaves = 0;
      for (const mod of mods) {
        const mOct = mod.match(/^oct\(([+-]?\d+)\)$/i);
        if (mOct) {
          octaves += parseInt(mOct[1], 10);
          continue;
        }
        if (/^rev$/i.test(mod)) {
          expanded = expanded.slice().reverse();
          continue;
        }
        if (/^slow(?:\((\d+)\))?$/i.test(mod)) {
          const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
          const factor = mSlow && mSlow[1] ? parseInt(mSlow[1], 10) : 2;
          const out: string[] = [];
          for (const t of expanded) for (let r = 0; r < factor; r++) out.push(t);
          expanded = out;
          continue;
        }
        if (/^fast(?:\((\d+)\))?$/i.test(mod)) {
          const mFast = mod.match(/^fast(?:\((\d+)\))?$/i);
          const factor = mFast && mFast[1] ? parseInt(mFast[1], 10) : 2;
          expanded = expanded.filter((_, idx) => idx % factor === 0);
          continue;
        }
        const mTrans = mod.match(/^([+-]?\d+)$/);
        if (mTrans) {
          semitones += parseInt(mTrans[1], 10);
          continue;
        }
        const mSem = mod.match(/^semitone\((-?\d+)\)$/i) || mod.match(/^st\((-?\d+)\)$/i) || mod.match(/^trans\((-?\d+)\)$/i);
        if (mSem) {
          semitones += parseInt(mSem[1], 10);
          continue;
        }
      }
      if (semitones !== 0 || octaves !== 0) {
        expanded = transposePattern(expanded, { semitones, octaves });
      }
    }
    return { name: baseName, tokens: expanded };
  } catch (err) {
    return { name: baseName, tokens: [rhs] };
  }
};

const parseChannelRhs = (id: number, rhs: string, pats: Record<string, string[]>, loc?: SourceLocation): ChannelNode & { seqSpecTokens?: string[] } => {
  const tokens = rhs.split(/\s+/);
  const ch: { id: number; inst?: string; pat?: string | string[]; speed?: number; seqSpecTokens?: string[]; loc?: SourceLocation } = { id, loc };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'inst' && tokens[i + 1]) {
      ch.inst = tokens[i + 1];
      i++;
    } else if (t === 'pat' && tokens[i + 1]) {
      // Support both single pattern and multiple patterns after 'pat'
      // e.g., "pat melody" or "pat intro verse chorus"
      const restTokens = tokens.slice(i + 1);
      const rest = restTokens.join(' ');
      let patSpec = (rest.startsWith('"') || rest.startsWith("'")) ? rest.replace(/^['"]|['"]$/g, '') : rest;
      ch.pat = patSpec.trim();
      ch.seqSpecTokens = restTokens;
      break;
    } else if (t === 'seq' && tokens[i + 1]) {
      const restTokens = tokens.slice(i + 1);
      const rest = restTokens.join(' ');
      let seqSpec = (rest.startsWith('"') || rest.startsWith("'")) ? rest.replace(/^['"]|['"]$/g, '') : rest;
      ch.pat = seqSpec.trim();
      ch.seqSpecTokens = restTokens;
      break;
    } else if (t.startsWith('bpm=')) {
      const v = t.slice(4);
      throw new Error(
        `channel ${id}: channel-level 'bpm' is not supported (found 'bpm=${v}'). ` +
        `Use a top-level 'bpm' directive or sequence transforms (fast/slow) instead.`
      );
    } else if (t === 'bpm') {
      const v = tokens[i + 1];
      throw new Error(
        `channel ${id}: channel-level 'bpm' is not supported (found 'bpm ${v}'). ` +
        `Use a top-level 'bpm' directive or sequence transforms (fast/slow) instead.`
      );
    } else if (t.startsWith('speed=')) {
      let v = t.slice(6);
      v = String(v).replace(/x$/i, '');
      const n = parseFloat(v);
      if (!isNaN(n)) ch.speed = n;
    } else if (t === 'speed' && tokens[i + 1]) {
      let v = tokens[i + 1];
      v = String(v).replace(/x$/i, '');
      const n = parseFloat(v);
      if (!isNaN(n)) { ch.speed = n; i++; }
    }
  }

  if (typeof ch.pat === 'string') {
    const parts = ch.pat.split(':');
    const base = parts[0];
    const mods = parts.slice(1);
    if (pats[base]) {
      const res = applyModsToTokens(pats[base].slice(), mods);
      if (res.instOverride) ch.inst = res.instOverride;
      ch.pat = res.tokens;
    }
  }

  return ch;
};

const parsePlay = (args: string): PlayNode => {
  const flagsRaw = args ? args.trim() : '';
  const flags = flagsRaw ? flagsRaw.split(/\s+/) : [];
  return {
    flags,
    auto: flags.includes('auto'),
    repeat: flags.includes('repeat'),
  };
};

const parseArrangeDefaults = (raw: string | null | undefined): any => {
  if (!raw) return undefined;
  const out: any = {};
  // support comma-separated or space-separated key=value pairs
  const parts = String(raw).split(/[\,\s]+/).map(p => p.trim()).filter(Boolean);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq >= 0) {
      const k = p.slice(0, eq).trim();
      const v = p.slice(eq + 1).trim();
      if (/^bpm$/i.test(k)) {
        const n = parseInt(v, 10);
        out.bpm = !Number.isNaN(n) ? n : v;
      } else if (/^speed$/i.test(k)) {
        const n = parseFloat(String(v).replace(/x$/i, ''));
        out.speed = !Number.isNaN(n) ? n : v;
      } else if (/^inst$/i.test(k)) {
        out.inst = v;
      } else {
        out[k] = v;
      }
    }
  }
  return out;
};

/**
 * Enhance Peggy parse error messages for common cases
 */
function enhanceParseError(error: any, source: string): Error {
  if (!error.location || !error.location.start) {
    return error;
  }

  let message = error.message || String(error);
  const lines = source.split('\n');
  const errorLine = lines[error.location.start.line - 1];

  if (errorLine) {
    const lineStart = errorLine.trim();
    const firstWord = lineStart.split(/\s+/)[0];
    const foundChar = error.found;

    // Check if error is at end of line (found carriage return/newline) - likely unknown keyword
    if (!foundChar || foundChar === '\r' || foundChar === '\n') {
      // List of valid keywords
      const validKeywords = [
        'chip', 'bpm', 'time', 'stepsPerBar', 'ticksPerStep',
        'inst', 'pat', 'seq', 'channel', 'play', 'export', 'import', 'song'
      ];

      if (firstWord && !validKeywords.includes(firstWord) && !/^[A-Z]/.test(firstWord)) {
        message = `Unknown keyword '${firstWord}'. Valid keywords: chip, bpm, time, inst, pat, seq, channel, play, export, import, song`;
        error.message = message;
      }
    }
  }

  return error;
}

const VALID_KEYWORDS = [
  'chip', 'bpm', 'volume', 'time', 'stepsPerBar', 'ticksPerStep',
  'song', 'import', 'inst', 'effect', 'pat', 'seq', 'arrange',
  'channel', 'play', 'export',
];

function toSourceLocation(loc: any): SourceLocation | undefined {
  if (!loc?.start) return undefined;
  return {
    start: {
      offset: Number(loc.start.offset ?? 0),
      line: Number(loc.start.line ?? 1),
      column: Number(loc.start.column ?? 1),
    },
    end: {
      offset: Number(loc.end?.offset ?? loc.start.offset ?? 0),
      line: Number(loc.end?.line ?? loc.start.line ?? 1),
      column: Number(loc.end?.column ?? loc.start.column ?? 1),
    },
  };
}

function createEmptyAST(): AST {
  return { pats: {}, insts: {}, seqs: {}, channels: [] };
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

function suggestKeyword(word: string): string | null {
  const lower = word.toLowerCase();
  let best: { keyword: string; distance: number } | null = null;
  for (const kw of VALID_KEYWORDS) {
    const distance = levenshtein(lower, kw);
    if (!best || distance < best.distance) best = { keyword: kw, distance };
  }
  return best && best.distance <= 2 ? best.keyword : null;
}

function parseRecoveryError(stmt: ErrorStmt): ParseError {
  const raw = String(stmt.raw ?? '').trim();
  const firstWord = raw.split(/\s+/)[0] ?? '';
  const firstWordLower = firstWord.toLowerCase();
  let message = `Invalid statement syntax: '${raw || '<empty>'}'.`;

  if (firstWord && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(firstWord) && !VALID_KEYWORDS.includes(firstWordLower)) {
    const suggestion = suggestKeyword(firstWord);
    message = suggestion
      ? `Unknown keyword '${firstWord}'. Did you mean '${suggestion}'?`
      : `Unknown keyword '${firstWord}'. Valid keywords: ${VALID_KEYWORDS.join(', ')}.`;
  } else if (/^channel\b/i.test(raw) && !raw.includes('=>')) {
    message = `Channel statement is missing '=>'. Expected: channel <n> => ...`;
  } else if (/^inst\b/i.test(raw) && /=\s*$/.test(raw)) {
    message = `Instrument statement is incomplete: missing value after '='.`;
  } else if (/^seq\b/i.test(raw) && /=\s*$/.test(raw)) {
    message = `Sequence statement is incomplete: missing sequence content after '='.`;
  } else if (/^pat\b/i.test(raw) && /=\s*$/.test(raw)) {
    message = `Pattern statement is incomplete: missing pattern content after '='.`;
  }

  return { message, loc: stmt.loc, type: 'recovery' };
}

export function parseWithPeggy(source: string): ParseResult {
  // reset per-parse-run warning flag
  _csvNormalizationWarned = false;

  log.debug('Parsing source code', { length: source.length });

  let program: ProgramNode;
  const parseErrors: ParseError[] = [];
  try {
    program = peggyParse(source, {}) as ProgramNode;
    log.debug('Peggy parse complete', { statements: program.body.length });
  } catch (e: any) {
    const enhanced = enhanceParseError(e, source) as any;
    const loc = toSourceLocation(e?.location ?? enhanced?.location);
    parseErrors.push({
      message: enhanced?.message ?? String(e),
      loc,
      type: 'syntax',
    });
    return { ast: createEmptyAST(), errors: parseErrors, hasErrors: true };
  }
  const pats: Record<string, string[]> = {};
  const insts: InstMap = {};
  const seqs: SeqMap = {};
  const effects: Record<string, string> = {};
  const channels: ChannelNode[] = [];
  const arrs: Record<string, any> = {};
  const metadata: SongMetadata = {};
  const imports: { source: string; loc?: SourceLocation }[] = [];

  // Structured Peggy events are enabled by default; always provide containers
  // for structured fields so the parser populates them during parse.
  const patternEvents: PatternEventMap | undefined = {};
  const sequenceItems: SequenceItemMap | undefined = {};

  let topBpm: number | undefined = undefined;
  let topTime: number | undefined = undefined;
  let topStepsPerBar: number | undefined = undefined;
  let chipName: string | undefined = undefined;
  let chipLoc: SourceLocation | undefined = undefined;
  let topVolume: number | undefined = undefined;
  let playNode: PlayNode | undefined = undefined;
  let playLoc: SourceLocation | undefined = undefined;

  for (const stmt of program.body) {
    switch (stmt.nodeType) {
      case 'SongMetaStmt': {
        const val = stmt.value ?? '';
        if (stmt.key === 'tags') {
          const tags = val.split(/[\,\n\r]+/).map(t => t.trim()).filter(Boolean);
          metadata.tags = (metadata.tags || []).concat(tags);
        } else if (stmt.key === 'name') {
          metadata.name = val;
        } else if (stmt.key === 'artist') {
          metadata.artist = val;
        } else if (stmt.key === 'description') {
          metadata.description = val;
        }
        break;
      }
      case 'BpmStmt': {
        topBpm = stmt.bpm;
        break;
      }
      case 'TimeStmt': {
        topTime = (stmt as TimeStmt).time;
        break;
      }
      case 'StepsPerBarStmt': {
        topStepsPerBar = (stmt as StepsPerBarStmt).stepsPerBar;
        break;
      }
      case 'VolumeStmt': {
        topVolume = Math.max(0, Math.min(1, (stmt as VolumeStmt).volume));
        break;
      }
      case 'ChipStmt': {
        chipName = stmt.chip;
        chipLoc = stmt.loc;
        break;
      }
      case 'ImportStmt': {
        imports.push({ source: stmt.source, loc: stmt.loc });
        break;
      }
      case 'InstStmt': {
        parseInstRhs(stmt.name, stmt.rhs, insts, stmt.loc);
        break;
      }
      case 'EffectStmt': {
        // store raw RHS for named effect presets (e.g. `effect wobble = vib:4,6`)
        const rhs = (stmt as any).rhs ? String((stmt as any).rhs).trim() : '';
        if (rhs) effects[stmt.name] = rhs;
        break;
      }
      case 'PatStmt': {
        const { name, tokens } = expandPatternSpec(stmt.name, (stmt as any).rhs, (stmt as any).rhsTokens, stmt.rhsEvents, stmt.loc);
        if (patternEvents && stmt.rhsEvents && stmt.rhsEvents.length > 0) {
          patternEvents[name] = stmt.rhsEvents;
        }
        pats[name] = tokens;
        break;
      }
      case 'SeqStmt': {
        const rhs = stmt.rhs ? stmt.rhs.trim() : '';
        const items = normalizeSeqItems(stmt.rhsItems, rhs, stmt.rhsTokens);
        if (items.length === 0) {
          warn('parser', `sequence '${stmt.name}' has no RHS content (empty). Define patterns after '=' or remove the empty 'seq ${stmt.name} =' line.`);
          seqs[stmt.name] = [];
          break;
        }
        if (sequenceItems) {
          sequenceItems[stmt.name] = items;
        }
        seqs[stmt.name] = materializeSequenceItems(items);
        break;
      }
      case 'ArrangeStmt': {
        // stmt.arrangements is an array of rows; each row is an array of slot names or null
        const parsedDefaults = parseArrangeDefaults((stmt as any).defaults ?? null);
        arrs[stmt.name] = { name: stmt.name, arrangements: (stmt as any).arrangements || [], defaults: parsedDefaults, loc: stmt.loc };
        break;
      }
      case 'ChannelStmt': {
        channels.push(parseChannelRhs(stmt.channel, stmt.rhs.trim(), pats, stmt.loc));
        break;
      }
      case 'PlayStmt': {
        playNode = parsePlay(stmt.args);
        playLoc = stmt.loc;
        break;
      }
      case 'ErrorStmt': {
        parseErrors.push(parseRecoveryError(stmt as ErrorStmt));
        break;
      }
      default:
        // ignore for now (time/stepsPerBar/ticksPerStep/export)
        break;
    }
  }

  if (chipName === 'gameboy' || !chipName) {
    for (const [name, props] of Object.entries(insts)) {
      const p = props as any;
      if (p.sweep && p.type !== 'pulse1') {
        warn('parser', `Instrument '${name}' has a 'sweep' property but is not type 'pulse1'. Sweep is only supported on Pulse 1.`);
      }

      if (p.type && String(p.type).toLowerCase() === 'wave') {
        const raw = p.volume !== undefined ? p.volume : (p.vol !== undefined ? p.vol : undefined);
        if (raw === undefined) {
          p.volume = 100;
        } else {
          let s = String(raw).trim();
          if (s.endsWith('%')) s = s.slice(0, -1).trim();
          const vNum = parseInt(s, 10);
          if (![0, 25, 50, 100].includes(vNum)) {
            throw new Error(`Invalid wave volume ${raw} for instrument "${name}". Must be 0, 25, 50, or 100`);
          }
          p.volume = vNum;
        }
      }
    }
  }

  // --- Semantic validation pass: populate ast.diagnostics ---
  const diagnostics: ParseDiagnostic[] = [];
  const diag = (level: ParseDiagnostic['level'], component: string, message: string, loc?: SourceLocation) =>
    diagnostics.push({ level, component, message, loc });

  // Chip name validation — consult the live registry so plugin-registered chips are accepted
  const registeredChips = chipRegistry.list();
  if (chipName && !registeredChips.includes(String(chipName).toLowerCase())) {
    diag('error', 'parser', `Unknown chip '${chipName}'. Supported chips: ${registeredChips.join(', ')}.`, chipLoc);
  }

  // Play flag validation
  const VALID_PLAY_FLAGS = ['auto', 'repeat'];
  for (const flag of (playNode?.flags ?? [])) {
    if (!VALID_PLAY_FLAGS.includes(flag.toLowerCase())) {
      diag('error', 'parser', `'play' has unknown flag '${flag}'. Valid flags: ${VALID_PLAY_FLAGS.join(', ')}.`, playLoc);
    }
  }

  // Instrument type and property validation.
  // When the song targets a registered chip plugin, delegate to its validateInstrument()
  // so the plugin can accept its own types (e.g. 'triangle', 'dmc' for NES) and
  // known properties (e.g. sweep_en, noise_period) without false warnings.
  const activePlugin = chipName ? chipRegistry.get(String(chipName).toLowerCase()) : undefined;

  const VALID_INST_TYPES = ['pulse1', 'pulse2', 'wave', 'noise'];
  const INST_COMMON_PROPS = new Set(['type', 'volume', 'length', 'gm', 'note', 'env', 'envelope', 'speed', 'pan']);
  const INST_TYPE_PROPS: Record<string, Set<string>> = {
    pulse1: new Set(['duty', 'sweep', 'width']),
    pulse2: new Set(['duty', 'width']),
    wave:   new Set(['wave']),
    noise:  new Set(['width', 'divisor', 'shift', 'lfsr']),
  };
  for (const [instName, instDef] of Object.entries(insts)) {
    const p = instDef as any;
    const instLoc: SourceLocation | undefined = p.__loc;
    const type: string | undefined = p.type;

    if (activePlugin) {
      // Delegate fully to the plugin — it knows its own valid types and properties
      const errors = activePlugin.validateInstrument(p as any);
      for (const e of errors) {
        // Type errors are hard errors; property errors are warnings (keep parity with GB behaviour)
        const level = e.field === 'type' ? 'error' : 'warning';
        diag(level, 'parser', `Instrument '${instName}': ${e.message}`, instLoc);
      }
    } else {
      // Fallback: built-in Game Boy validation
      const typeKey = type ? String(type).toLowerCase() : '';
      const knownTypeProps = new Set<string>();
      for (const set of Object.values(INST_TYPE_PROPS)) {
        for (const prop of set) knownTypeProps.add(prop);
      }
      const allowedProps = new Set([
        ...INST_COMMON_PROPS,
        ...(INST_TYPE_PROPS[typeKey] ?? Array.from(knownTypeProps)),
      ]);
      if (type && !VALID_INST_TYPES.includes(String(type).toLowerCase())) {
        diag('error', 'parser', `Instrument '${instName}': unknown type '${type}'. Valid types: ${VALID_INST_TYPES.join(', ')}.`, instLoc);
      }
      for (const key of Object.keys(p)) {
        if (key === '__loc') continue;
        const bare = key.includes(':') ? key.split(':').pop()! : key;
        if (!allowedProps.has(bare.toLowerCase())) {
          diag('warning', 'parser', `Instrument '${instName}': unknown property '${key}'.`, instLoc);
        }
      }
    }
  }

  // Channel validation: missing inst, unknown inst reference, missing seq/pat, unknown seq/pat reference
  for (const ch of channels) {
    const chLoc = ch.loc;
    const chAny = ch as any;
    if (!ch.inst) {
      diag('error', 'parser', `Channel ${ch.id}: no instrument assigned -- check for a typo in 'inst <name>'.`, chLoc);
    } else if (!insts[ch.inst]) {
      // Downgrade to a warning when imports are present: the instrument may be
      // supplied by an import that hasn't been resolved yet.
      const instDiagLevel = imports.length > 0 ? 'warning' : 'error';
      diag(instDiagLevel, 'parser', `Channel ${ch.id}: instrument '${ch.inst}' is not defined.`, chLoc);
    }
    const hasSeqSpec = chAny.seqSpecTokens && (chAny.seqSpecTokens as string[]).length > 0;
    const hasPat = ch.pat !== undefined;
    if (!hasSeqSpec && !hasPat) {
      diag('error', 'parser', `Channel ${ch.id}: no sequence or pattern assigned -- check for a typo in 'seq <name>'.`, chLoc);
    } else {
      // Check that each referenced seq/pat name exists
      const rawTokens: string[] = hasSeqSpec ? (chAny.seqSpecTokens as string[]) : [];
      if (rawTokens.length === 0 && typeof ch.pat === 'string') rawTokens.push(...ch.pat.split(/[\s,]+/));
      for (const tok of rawTokens) {
        const base = tok.split(':')[0].trim().replace(/\s*\*\s*\d+$/, '');
        if (base && !seqs[base] && !pats[base]) {
          diag('error', 'parser', `Channel ${ch.id}: sequence/pattern '${base}' is not defined.`, chLoc);
        }
      }
    }
  }

  // Pattern token validation: flag unrecognised tokens that are not notes/rests/inst-refs
  //   kind:'token' is the grammar's catch-all Identifier fallback — a plain word that matched
  //   nothing more specific.  If it isn't a note, a known inst/seq/pat name, or a transform
  //   call / effect reference, it is almost certainly a typo.
  const NOTE_RE = /^[A-Ga-g][#b]?-?[0-9]+$/;
  // Tokens produced by IdentWithCall (e.g. oct(-1)) or IdentWithEffects (e.g. name<vib>)
  // always contain '(' or '<', so a plain identifier with neither is the risky case.
  const isCallOrEffect = (v: string) => v.includes('(') || v.includes('<');
  if (patternEvents) {
    for (const [patName, events] of Object.entries(patternEvents)) {
      for (const ev of events) {
        if (!ev || ev.kind !== 'token') continue;
        const val = ev.value;
        if (!val || isCallOrEffect(val)) continue;
        // It's a plain identifier — valid if it's a note, rest char, or a known name
        if (NOTE_RE.test(val)) continue;
        if (val === '.' || val === '_' || val === '-') continue;
        if (insts[val] || pats[val] || seqs[val]) continue;
        // Skip when imports are present: the token may be a valid instrument
        // name that will be introduced by import resolution.
        if (imports.length > 0) continue;
        diag('warning', 'parser', `Pattern '${patName}': unknown token '${val}' — not a valid note, rest, or defined name.`, ev.loc);
      }
    }
  }

  // Sequence item reference validation: check each item name exists as a seq or pat
  for (const [seqName, items] of Object.entries(sequenceItems ?? {})) {
    for (const item of items) {
      const base = item.name.split(':')[0].trim().replace(/\s*\*\s*\d+$/, '');
      if (base && !seqs[base] && !pats[base]) {
        diag('error', 'parser', `Sequence '${seqName}': pattern/sequence '${base}' is not defined.`, item.loc);
      }
    }
  }

  const includeStructured = true;

  const ast: AST = { pats, insts, seqs, channels, arranges: Object.keys(arrs).length ? arrs : undefined, bpm: topBpm, chip: chipName, volume: topVolume, play: playNode, metadata,
    time: topTime, stepsPerBar: topStepsPerBar };
  if (diagnostics.length > 0) ast.diagnostics = diagnostics;
  if (Object.keys(effects).length) (ast as any).effects = effects;
  if (imports.length > 0) ast.imports = imports;
  if (includeStructured) {
    if (patternEvents) ast.patternEvents = patternEvents;
    if (sequenceItems) ast.sequenceItems = sequenceItems;
  }

  log.debug('Parse complete', {
    patterns: Object.keys(pats).length,
    sequences: Object.keys(seqs).length,
    instruments: Object.keys(insts).length,
    channels: channels.length,
    imports: imports.length,
  });

  log.info(`Parsed successfully: ${Object.keys(pats).length} patterns, ${Object.keys(seqs).length} sequences, ${Object.keys(insts).length} instruments`);

  return { ast, errors: parseErrors, hasErrors: parseErrors.length > 0 };
}
