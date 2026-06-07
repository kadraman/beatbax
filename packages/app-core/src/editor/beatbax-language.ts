/**
 * BeatBax language definition for Monaco Editor
 * Provides syntax highlighting, autocomplete, and language features
 */

import * as monaco from 'monaco-editor';
import { parse } from '@beatbax/engine/parser';
import { chipRegistry } from '@beatbax/engine/chips';
import { eventBus } from '../utils/event-bus.js';
import { isTopLevelBaxLine } from './top-level-directives.js';
import {
  COMPLETION_TRIGGER_CHARACTERS,
  provideBeatBaxCompletions,
} from './completion.js';
import { registerBeatBaxCodeActions } from './code-actions.js';
import {
  CHIP_INSTRUMENT_META,
  INST_PROPERTY_NAME_PATTERN,
} from './instrument-meta.js';
import { buildGmHoverMarkdown, parseGmAtPosition } from './gm-programs.js';
import { buildNoteHoverMarkdown, parseNoteAtPosition } from './inst-note-hover.js';
import { buildInstPropertyHover, buildInstPropertyKeywordHover } from './inst-property-hover.js';

let latestAST: any = null;
/** AST with import instruments merged (when imports resolve successfully). */
let latestResolvedAst: any = null;
let latestSong: any = null;
/** Cached semantic-token result. Invalidated whenever the model version changes. */
let tokenCache: { versionId: number; data: Uint32Array } | null = null;
/** Emitter used to notify Monaco that semantic tokens should be recomputed. */
const semanticTokensChangedEmitter = new monaco.Emitter<void>();
/** Chip name resolved from the latest successfully-parsed AST. */
let latestChip: string = 'gameboy';
eventBus.on('parse:success', ({ ast, resolvedAst, song }) => {
  latestAST = ast;
  latestResolvedAst = resolvedAst ?? ast;
  latestSong = song ?? null;
  const raw: string = (ast?.chip ?? 'gameboy').toLowerCase();
  latestChip = chipRegistry.resolve(raw);
  // Parse results changed independently of model version (debounced parse);
  // force semantic token refresh so colors update after command-driven edits.
  tokenCache = null;
  semanticTokensChangedEmitter.fire();
});

interface WaveHoverParseResult {
  values: number[];
  range: monaco.IRange;
  hoveredIndex: number | null;
}

interface QuoteScanState {
  inDouble: boolean;
  inTriple: boolean;
}

function scanQuoteState(text: string, initial: QuoteScanState): QuoteScanState {
  let i = 0;
  let inDouble = initial.inDouble;
  let inTriple = initial.inTriple;

  while (i < text.length) {
    // Triple-quote delimiter toggles multiline-string mode.
    if (!inDouble && text.substring(i, i + 3) === '"""') {
      inTriple = !inTriple;
      i += 3;
      continue;
    }

    // Normal double-quoted strings are tracked only outside triple-quote mode.
    if (!inTriple && text[i] === '"' && (i === 0 || text[i - 1] !== '\\')) {
      inDouble = !inDouble;
    }

    i += 1;
  }

  return { inDouble, inTriple };
}

/**
 * Check if a position is inside a quoted string (double or triple-quoted).
 * Can work with either a line string directly or via Monaco model + position.
 */
function isPositionInString(
  modelOrLine: monaco.editor.ITextModel | string,
  positionOrColumn?: monaco.IPosition | number,
): boolean {
  // Overload: (string, number)
  if (typeof modelOrLine === 'string') {
    const line = modelOrLine;
    const column = (positionOrColumn as number) || 0;
    const upToCursor = line.substring(0, Math.max(0, column - 1));
    const state = scanQuoteState(upToCursor, { inDouble: false, inTriple: false });
    return state.inDouble || state.inTriple;
  }

  // Overload: (ITextModel, IPosition)
  const model = modelOrLine as monaco.editor.ITextModel;
  const position = positionOrColumn as monaco.IPosition;

  // If a lightweight mock omits getLineCount, gracefully fall back to line-local scan.
  if (typeof model.getLineCount !== 'function') {
    const line = model.getLineContent(position.lineNumber);
    const upToCursor = line.substring(0, Math.max(0, position.column - 1));
    const state = scanQuoteState(upToCursor, { inDouble: false, inTriple: false });
    return state.inDouble || state.inTriple;
  }

  let state: QuoteScanState = { inDouble: false, inTriple: false };

  for (let lineNo = 1; lineNo <= model.getLineCount(); lineNo++) {
    const line = model.getLineContent(lineNo);
    if (lineNo < position.lineNumber) {
      state = scanQuoteState(line, state);
      continue;
    }

    const upToCursor = line.substring(0, Math.max(0, position.column - 1));
    const cursorState = scanQuoteState(upToCursor, state);
    return cursorState.inDouble || cursorState.inTriple;
  }

  return false;
}

function parseWaveLiteralAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
): WaveHoverParseResult | null {
  const line = model.getLineContent(position.lineNumber);
  const waveRegex = /\bwave\s*=\s*\[([^\]]*)\]/g;
  let match: RegExpExecArray | null;

  while ((match = waveRegex.exec(line)) !== null) {
    const matchText = match[0];
    const openBracketRel = matchText.indexOf('[');
    if (openBracketRel < 0) continue;

    const openBracketIdx = match.index + openBracketRel;
    const closeBracketIdx = line.indexOf(']', openBracketIdx);
    if (closeBracketIdx < 0) continue;

    const column0 = position.column - 1;
    if (column0 < openBracketIdx || column0 > closeBracketIdx + 1) continue;

    const inner = line.slice(openBracketIdx + 1, closeBracketIdx);
    const numberRegex = /-?\d+(?:\.\d+)?/g;
    const values: number[] = [];
    let hoveredIndex: number | null = null;
    let n: RegExpExecArray | null;

    while ((n = numberRegex.exec(inner)) !== null) {
      const parsed = Number(n[0]);
      if (!Number.isFinite(parsed)) continue;

      const idx = values.length;
      values.push(parsed);

      const tokenStartIdx = openBracketIdx + 1 + n.index;
      const tokenStartCol = tokenStartIdx + 1;
      const tokenEndCol = tokenStartCol + n[0].length;
      if (position.column >= tokenStartCol && position.column <= tokenEndCol) {
        hoveredIndex = idx;
      }
    }

    if (values.length === 0) return null;

    return {
      values,
      hoveredIndex,
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: openBracketIdx + 1,
        endColumn: closeBracketIdx + 2,
      },
    };
  }

  return null;
}

function renderWaveSparkline(values: number[], hoveredIndex: number | null): string {
  const levels = ' ▁▂▃▄▅▆▇█';
  const clamped = values.map((v) => Math.max(0, Math.min(15, Math.round(v))));
  const line = clamped
    .map((v) => {
      const level = Math.round((v / 15) * 8);
      return levels[level] ?? levels[0];
    })
    .join('');

  if (hoveredIndex === null || hoveredIndex < 0 || hoveredIndex >= clamped.length) {
    return line;
  }

  const marker = `${' '.repeat(hoveredIndex)}^`;
  return `${line}\n${marker}`;
}

function buildWaveHover(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
): monaco.languages.Hover | null {
  const parsed = parseWaveLiteralAtPosition(model, position);
  if (!parsed) return null;

  const clamped = parsed.values.map((v) => Math.max(0, Math.min(15, Math.round(v))));
  const min = Math.min(...clamped);
  const max = Math.max(...clamped);

  let meta = `Samples: ${parsed.values.length}  Clamped range: ${min}..${max}`;
  if (parsed.hoveredIndex !== null) {
    const raw = parsed.values[parsed.hoveredIndex];
    const clampedValue = clamped[parsed.hoveredIndex];
    meta += `\nIndex ${parsed.hoveredIndex}: raw=${raw} clamped=${clampedValue}`;
  }

  return {
    range: parsed.range,
    contents: [
      { value: '**Waveform preview**' },
      { value: `\`\`\`text\n${renderWaveSparkline(parsed.values, parsed.hoveredIndex)}\n\`\`\`` },
      { value: meta },
    ],
  };
}

// ── Envelope hover ───────────────────────────────────────────────────────────

interface ParsedEnvelope {
  /** Initial volume level 0–15. */
  level: number;
  /** 'up' | 'down' | 'flat'. */
  direction: 'up' | 'down' | 'flat';
  /** Envelope period 0–7. 0 = constant (no sweep). */
  period: number;
  /** Source string, used for display. */
  raw: string;
  /** Monaco range covering the full env=... value token. */
  range: monaco.IRange;
}

/**
 * Detect and parse the `env=` value when the cursor sits anywhere inside it.
 * Handles three formats:
 *   - JSON object:  env={"level":12,"direction":"down","period":1}
 *   - gb-prefixed:  env=gb:12,down,1
 *   - short form:   env=12,down,1   or  env=12,down
 */
export function parseEnvelopeAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
): ParsedEnvelope | null {
  const line = model.getLineContent(position.lineNumber);
  const col0 = position.column - 1; // 0-based

  // ── JSON form: env={...} ─────────────────────────────────────────────────
  const jsonEnvRe = /\benv\s*=\s*(\{[^}]*\})/g;
  let m: RegExpExecArray | null;

  while ((m = jsonEnvRe.exec(line)) !== null) {
    const tokenStart = m.index;
    const tokenEnd = m.index + m[0].length - 1;
    if (col0 < tokenStart || col0 > tokenEnd) continue;

    try {
      const obj = JSON.parse(m[1]);
      const level = Number(obj.level ?? obj.initial ?? 15);
      const rawDir: string = String(obj.direction ?? 'down').toLowerCase();
      const direction = rawDir === 'up' ? 'up' : rawDir === 'flat' ? 'flat' : 'down';
      const period = Number(obj.period ?? obj.step ?? 0);
      return {
        level: Math.max(0, Math.min(15, level)),
        direction,
        period: Math.max(0, Math.min(7, period)),
        raw: m[1],
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: tokenStart + 1,
          endColumn: tokenEnd + 2,
        },
      };
    } catch {
      continue;
    }
  }

  // ── gb-prefixed or short form: env=gb:L,dir,period or env=L,dir[,period] ─
  // Match everything after `env=` up to next whitespace or end-of-line
  const shortEnvRe = /\benv\s*=\s*((?:gb:)?\S+)/g;
  while ((m = shortEnvRe.exec(line)) !== null) {
    const tokenStart = m.index;
    const tokenEnd = m.index + m[0].length - 1;
    if (col0 < tokenStart || col0 > tokenEnd) continue;

    let raw = m[1];
    if (raw.startsWith('gb:')) raw = raw.slice(3);
    if (raw.startsWith('"') || raw.startsWith('{')) continue; // already handled above

    const parts = raw.split(',');
    const level = Math.max(0, Math.min(15, parseInt(parts[0] ?? '15', 10)));
    const rawDir = (parts[1] ?? 'down').toLowerCase();
    const direction: 'up' | 'down' | 'flat' =
      rawDir === 'up' ? 'up' : rawDir === 'flat' ? 'flat' : 'down';
    const period = Math.max(0, Math.min(7, parseInt(parts[2] ?? '0', 10)));

    if (Number.isNaN(level)) continue;

    return {
      level,
      direction,
      period,
      raw: m[1],
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: tokenStart + 1,
        endColumn: tokenEnd + 2,
      },
    };
  }

  return null;
}

/**
 * Simulate a Game Boy NR5x hardware envelope and return the volume level
 * at each tick step (one step = one NR52 envelope tick, ~1/64 s).
 * Returns 20 steps, which is enough to show the full decay/attack.
 */
export function simulateGBEnvelope(env: ParsedEnvelope, steps = 20): number[] {
  const result: number[] = [];
  let vol = env.level;

  for (let t = 0; t < steps; t++) {
    result.push(vol);

    if (env.period === 0 || env.direction === 'flat') continue;

    // GB envelope: volume changes every `period` steps
    if ((t + 1) % env.period === 0) {
      if (env.direction === 'up') {
        vol = Math.min(15, vol + 1);
      } else {
        vol = Math.max(0, vol - 1);
      }
    }
  }

  return result;
}

/**
 * Render a horizontal level sparkline for an envelope volume curve.
 * Each character represents one step; height encodes level 0–15.
 */
export function renderEnvelopeSparkline(levels: number[]): string {
  const chars = ' ▁▂▃▄▅▆▇█';
  return levels
    .map((v) => {
      const idx = Math.round(Math.max(0, Math.min(15, v)) / 15 * 8);
      return chars[idx] ?? chars[0];
    })
    .join('');
}

function buildGmHover(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
): monaco.languages.Hover | null {
  const parsed = parseGmAtPosition(model, position);
  if (!parsed) return null;

  return {
    range: parsed.range,
    contents: [{ value: buildGmHoverMarkdown(parsed.program) }],
  };
}

function buildNoteHover(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
  chip: string,
): monaco.languages.Hover | null {
  const parsed = parseNoteAtPosition(model, position);
  if (!parsed) return null;

  return {
    range: parsed.range,
    contents: [{ value: buildNoteHoverMarkdown(parsed, chip) }],
  };
}

function buildEnvelopeHover(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
): monaco.languages.Hover | null {
  const env = parseEnvelopeAtPosition(model, position);
  if (!env) return null;

  const steps = simulateGBEnvelope(env, 32);
  const sparkline = renderEnvelopeSparkline(steps);

  const dirLabel = env.direction === 'flat' ? 'flat (constant)' : env.direction;
  const periodLabel =
    env.period === 0
      ? '0 (constant — no sweep)'
      : `${env.period} (changes every ${env.period} step${env.period > 1 ? 's' : ''})`;

  const meta = [
    `Initial level: **${env.level}** / 15`,
    `Direction: **${dirLabel}**`,
    `Period: **${periodLabel}**`,
  ].join('  \n');

  return {
    range: env.range,
    contents: [
      { value: '**Envelope preview** (GB hardware simulation, 32 steps)' },
      { value: `\`\`\`text\n${sparkline}\n\`\`\`` },
      { value: meta },
    ],
  };
}

// ── NES macro envelope hover ──────────────────────────────────────────────────

const NES_MACRO_TYPES = ['vol_env', 'arp_env', 'pitch_env', 'duty_env'] as const;
type NesMacroType = (typeof NES_MACRO_TYPES)[number];

export interface ParsedNesMacro {
  /** Which macro field was matched. */
  macroType: NesMacroType;
  /** Parsed numeric values. */
  values: number[];
  /** Index to loop back to at end of sequence; -1 = one-shot. */
  loopPoint: number;
  /** Monaco range covering the entire `field=[...]` token. */
  range: monaco.IRange;
}

/**
 * Detect and parse a NES software-macro field when the cursor sits anywhere inside
 * `vol_env=[...]`, `arp_env=[...]`, `pitch_env=[...]`, or `duty_env=[...]`.
 * Supports the optional loop-point suffix: `[v0,v1,...|loopIndex]`.
 */
export function parseNesMacroAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
): ParsedNesMacro | null {
  const line = model.getLineContent(position.lineNumber);
  const col0 = position.column - 1; // 0-based

  for (const macroType of NES_MACRO_TYPES) {
    const re = new RegExp(`\\b${macroType}\\s*=\\s*(\\[[^\\]]*\\])`, 'g');
    let m: RegExpExecArray | null;

    while ((m = re.exec(line)) !== null) {
      const tokenStart = m.index;
      const tokenEnd = m.index + m[0].length - 1;
      if (col0 < tokenStart || col0 > tokenEnd) continue;

      const inner = m[1].slice(1, -1); // strip [ and ]

      // Split at optional loop-point separator `|N`
      let loopPoint = -1;
      let contentStr = inner;
      const pipeIdx = inner.lastIndexOf('|');
      if (pipeIdx >= 0) {
        const lpNum = parseInt(inner.slice(pipeIdx + 1).trim(), 10);
        if (!isNaN(lpNum) && lpNum >= 0) loopPoint = lpNum;
        contentStr = inner.slice(0, pipeIdx);
      }

      const values = contentStr
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter(Number.isFinite);

      if (values.length === 0) continue;
      if (loopPoint >= values.length) loopPoint = values.length - 1;

      return {
        macroType,
        values,
        loopPoint,
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: tokenStart + 1,
          endColumn: tokenEnd + 2,
        },
      };
    }
  }

  return null;
}

/** Render a sparkline for an arbitrary array of values, normalizing to [min, max]. */
export function renderNesMacroSparkline(values: number[], min: number, max: number): string {
  const chars = ' ▁▂▃▄▅▆▇█';
  const range = max - min || 1;
  return values
    .map((v) => {
      const normalized = (Math.max(min, Math.min(max, v)) - min) / range;
      const idx = Math.round(normalized * 8);
      return chars[idx] ?? chars[0];
    })
    .join('');
}

/**
 * SMS/SN76489 attenuation sparkline — bar height = perceived loudness.
 * Attenuation 0 (loudest) → full block; 15 (silent) → empty.
 */
export function renderAttenuationSparkline(attenuationLevels: number[]): string {
  const loudness = attenuationLevels.map((v) =>
    Math.max(0, Math.min(15, 15 - Math.round(v))),
  );
  return renderNesMacroSparkline(loudness, 0, 15);
}

const DUTY_INDEX_LABELS = ['12.5%', '25%', '50%', '75%'];

function buildNesMacroHover(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
  chip: string = latestChip,
): monaco.languages.Hover | null {
  const macro = parseNesMacroAtPosition(model, position);
  if (!macro) return null;

  const canonicalChip = chipRegistry.resolve(chip);

  let title: string;
  let sparkline: string;
  let meta: string;

  const loopStr =
    macro.loopPoint >= 0
      ? `Loops from index **${macro.loopPoint}**`
      : 'One-shot (no loop — holds last value)';

  switch (macro.macroType) {
    case 'vol_env': {
      const clamped = macro.values.map((v) => Math.max(0, Math.min(15, Math.round(v))));
      const lo = Math.min(...clamped), hi = Math.max(...clamped);
      if (canonicalChip === 'spectrum-128') {
        sparkline = renderNesMacroSparkline(clamped, 0, 15);
        title = '**vol_env** — Hardware envelope program (AY R11–R13)';
        meta = [
          `Levels: **${clamped.length}**  Range: **${lo}–${hi}** / 15`,
          '⚠ **Global**: only one hardware envelope program (R11–R13) may be active at a time.',
          'For independent per-channel decay, use the `volSlide` effect instead.',
          loopStr,
        ].join('  \n');
      } else if (canonicalChip === 'nes') {
        sparkline = renderNesMacroSparkline(clamped, 0, 15);
        title = '**Volume envelope** (NES/Famicom software macro, per-frame, 0–15)';
        meta = `Frames: **${clamped.length}**  Range: **${lo}–${hi}** / 15  \n${loopStr}`;
      } else if (canonicalChip === 'sms') {
        sparkline = renderAttenuationSparkline(clamped);
        title = '**vol_env** — SMS volume macro (per-frame attenuation, 0–15)';
        meta = [
          `Frames: **${clamped.length}**  Range: **${lo}–${hi}** / 15`,
          '**0 = loudest** · **15 = silent** — sparkline shows perceived loudness',
          loopStr,
        ].join('  \n');
      } else {
        sparkline = renderNesMacroSparkline(clamped, 0, 15);
        title = '**Volume envelope** (software macro, per-frame, 0–15)';
        meta = `Frames: **${clamped.length}**  Range: **${lo}–${hi}** / 15  \n${loopStr}`;
      }
      break;
    }
    case 'arp_env': {
      const macroKind = canonicalChip === 'nes' ? 'NES/Famicom software macro' : 'software macro';
      title = `**Arpeggio envelope** (${macroKind}, semitone offsets from root)`;
      const lo = Math.min(...macro.values, 0);
      const hi = Math.max(...macro.values, 0);
      sparkline = renderNesMacroSparkline(macro.values, lo, hi);
      const valStr = macro.values.map((v) => (v >= 0 ? `+${v}` : `${v}`)).join(', ');
      meta = `Frames: **${macro.values.length}**  Offsets (semitones): ${valStr}  \n${loopStr}`;
      break;
    }
    case 'pitch_env': {
      const macroKind = canonicalChip === 'nes' ? 'NES/Famicom software macro' : 'software macro';
      title = `**Pitch envelope** (${macroKind}, semitone offsets from root)`;
      const lo = Math.min(...macro.values, 0);
      const hi = Math.max(...macro.values, 0);
      sparkline = renderNesMacroSparkline(macro.values, lo, hi);
      const valStr = macro.values.map((v) => (v >= 0 ? `+${v}` : `${v}`)).join(', ');
      meta = [
        `Frames: **${macro.values.length}**  Offsets (semitones): ${valStr}`,
        loopStr,
        ...(canonicalChip === 'nes'
          ? ['_Note: FamiTracker PITCH macro uses 1/16-semitone units — each value is multiplied by 16 on export._']
          : []),
      ].join('  \n');
      break;
    }
    case 'duty_env': {
      const clamped = macro.values.map((v) => Math.max(0, Math.min(3, Math.round(v))));
      title = canonicalChip === 'nes'
        ? '**Duty envelope** (NES/Famicom software macro, duty indices 0–3)'
        : '**Duty envelope** (software macro, duty indices 0–3)';
      sparkline = renderNesMacroSparkline(clamped, 0, 3);
      const dutyStr = clamped.map((v) => DUTY_INDEX_LABELS[v] ?? String(v)).join(', ');
      meta = `Frames: **${clamped.length}**  Duty cycle sequence: ${dutyStr}  \n${loopStr}`;
      break;
    }
  }

  return {
    range: macro.range,
    contents: [
      { value: title },
      { value: `\`\`\`text\n${sparkline}\n\`\`\`` },
      { value: meta },
    ],
  };
}

/**
 * Register BeatBax language with Monaco
 */
export function registerBeatBaxLanguage(): void {
  // Register the language
  monaco.languages.register({ id: 'beatbax' });

  // Set language configuration
  monaco.languages.setLanguageConfiguration('beatbax', {
    comments: {
      lineComment: '#',
    },
    brackets: [
      ['[', ']'],
      ['(', ')'],
      ['{', '}'],
    ],
    autoClosingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '{', close: '}' },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '{', close: '}' },
      { open: '"', close: '"' },
    ],
  });

  // Set syntax highlighting (Monarch tokenizer)
  const allInstrumentTypes = [
    ...new Set(Object.values(CHIP_INSTRUMENT_META).flatMap((m) => m.types)),
  ].join('|');
  const allChipTypeNames = chipRegistry.list().join('|');

  monaco.languages.setMonarchTokensProvider('beatbax', {
    keywords: [
      'chip',
      'bpm',
      'stepsPerBar',
      // Deprecated — kept for syntax highlighting in legacy songs (not in completions)
      'time',
      'ticksPerStep',
      'inst',
      'pat',
      'seq',
      'channel',
      'play',
      'export',
      'import',
      'from',
      'volume',
      'title',
      'artist',
      'author',
      'comment',
      'scale',
      'lock',
      'warn',
      'error',
      'off',
    ],

    // Instrument types
    instrumentTypes: ['pulse1', 'pulse2', 'wave', 'noise'],

    // Transform names (sequence modifiers)
    transforms: ['oct', 'rot', 'rotate', 'rev', 'pal', 'palindrome', 'slow', 'fast', 'transpose', 'semitone', 'st', 'trans', 'arp', 'clamp', 'fold', 'mute', 'rest', 'inst', 'pan'],

    // Inline effects (inside <...>)
    inlineEffects: ['vib', 'port', 'arp', 'volSlide', 'trem', 'pan', 'echo', 'retrig', 'sweep', 'cut', 'bend', 'pitch_env'],

    // Export formats
    exportFormats: ['json', 'midi', 'uge', 'wav', 'famitracker', 'famitracker-text'],

    // Chip types
    chipTypes: ['gameboy', 'gb', 'dmg'],

    // Note names (C0-B8)
    notes: /[A-G][#b]?[0-8]/,

    tokenizer: {
      root: [
        // Comments - BeatBax uses # syntax
        [/#.*$/, 'comment'],

        // Sequence modifiers - MUST be first before keywords catch pattern names
        [/:oct\b/, 'entity.name.function'],
        [/:rot(?:ate)?\b/, 'entity.name.function'],
        [/:inst\b/, 'entity.name.function'],
        [/:rev\b/, 'entity.name.function'],
        [/:pal(?:indrome)?\b/, 'entity.name.function'],
        [/:slow\b/, 'entity.name.function'],
        [/:fast\b/, 'entity.name.function'],
        [/:arp\b/, 'entity.name.function'],
        [/:clamp\b/, 'entity.name.function'],
        [/:fold\b/, 'entity.name.function'],
        [/:mute\b/, 'entity.name.function'],
        [/:rest\b/, 'entity.name.function'],
        [/:transpose\b/, 'entity.name.function'],
        [/:semitone\b/, 'entity.name.function'],
        [/:st\b/, 'entity.name.function'],
        [/:trans\b/, 'entity.name.function'],
        // User-defined effect preset modifiers (e.g., :ambient, :slapback)
        [/:[a-zA-Z_]\w*\b/, 'entity.name.function'],

        // Namespaced properties (e.g., gb:width) - MUST come before single properties
        [/\b(gb)(:)(width|lfsr)(?=\s*=)/, ['type', 'operator', 'attribute']],

        // Instrument/Effect property names (MUST come before keywords since 'volume' and 'wave' conflict)
        [new RegExp(`\\b(${INST_PROPERTY_NAME_PATTERN})\\b(?=\\s*=)`, ''), 'attribute'],

        // Song metadata properties (appear after 'song' directive)
        [/\b(name|artist|author|description|tags)\b(?=\s+")/, 'attribute'],

        // Deprecated top-level directives (before generic keyword rule)
        [/\b(time|ticksPerStep)\b/, 'keyword.deprecated'],

        // Top-level directives (scale handled separately — line-start only)
        [
          /\b(song|chip|bpm|stepsPerBar|volume|title|artist|author|comment)\b/,
          'keyword',
        ],

        // Channel lock option with value (lock=scale, lock scale) — before standalone lock/scale rules
        [
          /(\block)(\s*=\s*)(scale|root\+fifth|chord7|chord|octaves)\b/,
          ['attribute', 'operator', 'constant.language'],
        ],
        [
          /(\block)(\s+)(scale|root\+fifth|chord7|chord|octaves)\b/,
          ['attribute', '', 'constant.language'],
        ],

        // Channel lock option key only (lock=..., lock ...)
        [/\block\b(?=\s*[= ])/, 'attribute'],

        // Top-level scale directive (line start only — avoids clash with lock=scale)
        [/^\s*scale\b/, 'keyword'],

        // Scale lock values (partial / standalone occurrences)
        [/\b(root\+fifth|chord7|chord|octaves)\b/, 'constant.language'],

        // Scale modes
        [
          /\b(major|minor|dorian|phrygian|lydian|mixolydian|locrian|pentatonic_major|pentatonic_minor|blues|chromatic)\b/,
          'constant.language',
        ],

        // Scale enforcement (standalone; :off(N) handled by sequence modifier rules above)
        [/\b(warn|error|off)\b/, 'constant.language'],

        // Definitions - use state to capture definition names
        [/\b(inst|pat|seq|effect)\b/, { token: 'keyword', next: '@definitionName' }],
        [/\bimport\b/, { token: 'keyword', next: '@importStatement' }],
        [/\bchannel\b/, { token: 'keyword', next: '@channelNum' }],
        [/\bfrom\b/, 'keyword'],

        // Commands
        [/\b(play|export)\b/, 'keyword.control'],

        // Play modifiers
        [/\b(auto|repeat)\b/, 'keyword'],

        // Effect names (both inline and in effect definitions) - must come before identifiers
        [/\b(vib|port|arp|volSlide|trem|pan|echo|retrig|sweep|cut|bend|pitch_env)\b/, 'function'],

        // Inline effects inside angle brackets: <vib:3,6> <port:8> <arp:3,7>
        // MUST come before generic operators
        [/</, { token: 'delimiter.angle', next: '@inlineEffect' }],

        // Instrument types (all chips)
        [new RegExp(`\\b(${allInstrumentTypes})\\b`), 'type'],

        // Export formats (teal/cyan like constants)
        // famitracker-text must come before famitracker to avoid partial match
        [/\bfamitracker-text\b/, 'constant.language'],
        [/\b(json|midi|uge|wav|famitracker|vgm)\b/, 'constant.language'],

        // Chip types (registered plugins + aliases)
        [new RegExp(`\\b(${allChipTypeNames})\\b`), 'type'],

        // Notes (C0-B8)
        [/[A-G][#b]?[0-8]\b/, 'number.note'],

        // Pitch classes without octave (scale roots, etc.)
        [/[A-Ga-g][#b]?\b/, 'number.note'],

        // Rest token
        [/\./, 'number.rest'],

        // Numbers
        [/\d+/, 'number'],
        [/-?\d+/, 'number'],

        // Operators
        [/=>/, 'operator'],
        [/:/, 'operator'],
        // Equals followed by open brace - JSON object value
        [/=\{/, { token: 'operator', next: '@jsonObject' }],
        [/[=]/, 'operator'],
        [/[*+\-()]/, 'operator'],

        // Strings
        [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-terminated string
        [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],

        // Identifiers
        [/[a-zA-Z_]\w*/, 'identifier'],

        // Delimiters
        [/[,]/, 'delimiter'],
        [/[\[\]]/, '@brackets'],
      ],

      inlineEffect: [
        // Effect names: vib, port, arp, volSlide, trem, pan, echo, retrig, sweep
        [/\b(vib|port|arp|volSlide|trem|pan|echo|retrig|sweep|cut|bend|pitch_env)\b/, 'function'],
        // Colon separator
        [/:/, 'operator'],
        // Parameters (numbers, including signed)
        [/[+-]?\d+(\.\d+)?/, 'number'],
        [/,/, 'delimiter'],
        // Waveform names (for vib/trem) - must come before generic identifiers
        [/\b(sine|sin|tri|triangle|square|sqr|saw|sawtooth|ramp|noise|random|pulse|none|sawUp|sawDown|stepped|gated|gatedSlow)\b/, 'type'],
        // Panning values - must come before generic identifiers
        [/\b[LCR]\b/, 'constant'],
        // User-defined effect preset names (e.g., arpMinor, ambient, slapback)
        [/[a-zA-Z_]\w*/, 'function'],
        // Close angle bracket - return to root
        [/>/, { token: 'delimiter.angle', next: '@pop' }],
        // Whitespace
        [/\s+/, ''],
      ],

      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],

      definitionName: [
        // Whitespace
        [/\s+/, ''],
        // Capture the definition name and color it yellow (variable name)
        [/[a-zA-Z_]\w*/, { token: 'variable.name', next: '@pop' }],
        // If we hit anything else, go back to root
        [/./, { token: '@rematch', next: '@pop' }],
      ],

      importStatement: [
        // Whitespace
        [/\s+/, ''],
        // Import string with URI scheme - tokenize scheme separately
        [/"/, { token: 'string.quote', bracket: '@open', next: '@importString' }],
        // If we hit anything else, go back to root
        [/./, { token: '@rematch', next: '@pop' }],
      ],

      importString: [
        // URI schemes - color as constant (teal/cyan)
        [/\b(local|github|https?|file)(?=:)/, 'constant.language'],
        // Colon after scheme
        [/:/, 'operator'],
        // Rest of string content
        [/[^\\"]+/, 'string'],
        // Escape sequences
        [/\\./, 'string.escape'],
        // Close quote - pop back to importStatement (which will then pop to root)
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],

      jsonObject: [
        // Whitespace
        [/\s+/, ''],
        // Close brace - return to root (MUST come before generic brackets)
        [/\}/, { token: 'delimiter.bracket', next: '@pop' }],
        // Property names (quoted strings followed by colon) - light blue
        [/"([^"\\]|\\.)*"(?=\s*:)/, 'attribute'],
        // String values (quoted strings NOT followed by colon) - orange
        [/"([^"\\]|\\.)*"/, 'string'],
        // Numbers (including negative and decimals)
        [/-?\d+(\.\d+)?/, 'number'],
        // Booleans and null
        [/\b(true|false|null)\b/, 'keyword'],
        // Nested objects/arrays - stay in JSON state
        [/\{/, 'delimiter.bracket'],
        [/\[/, 'delimiter.bracket'],
        [/\]/, 'delimiter.bracket'],
        // Structural characters
        [/:/, 'delimiter'],
        [/,/, 'delimiter'],
      ],

      // Reads the channel number after the 'channel' keyword and emits a
      // per-channel token so each number gets its own colour in the theme.
      channelNum: [
        [/\s+/, ''],
        [/1\b/, { token: 'keyword.channel.1', next: '@pop' }],
        [/2\b/, { token: 'keyword.channel.2', next: '@pop' }],
        [/3\b/, { token: 'keyword.channel.3', next: '@pop' }],
        [/4\b/, { token: 'keyword.channel.4', next: '@pop' }],
        [/\d+/, { token: 'number', next: '@pop' }],
        [/./, { token: '@rematch', next: '@pop' }],
      ],
    },
  });

  // Register folding for consecutive comment lines (lines starting with '#')
  monaco.languages.registerFoldingRangeProvider('beatbax', {
    provideFoldingRanges(model, context, token) {
      const ranges = [];
      const lines = model.getLineCount();
      let start = null;
      for (let i = 1; i <= lines; i++) {
        const line = model.getLineContent(i);
        if (/^\s*#/.test(line)) {
          if (start === null) start = i;
        } else {
          if (start !== null && i - start > 1) {
            ranges.push({ start, end: i - 1, kind: monaco.languages.FoldingRangeKind.Comment });
          }
          start = null;
        }
      }
      // Handle file ending with a comment block
      if (start !== null && lines - start + 1 > 1) {
        ranges.push({ start, end: lines, kind: monaco.languages.FoldingRangeKind.Comment });
      }
      return ranges;
    }
  });

  // Register context-aware autocomplete (symbols, effects, modifiers)
  monaco.languages.registerCompletionItemProvider('beatbax', {
    triggerCharacters: [...COMPLETION_TRIGGER_CHARACTERS],
    provideCompletionItems: (model, position) =>
      provideBeatBaxCompletions(model, position, {
        ast: latestAST,
        resolvedAst: latestResolvedAst,
        song: latestSong,
        chip: latestChip,
      }),
  });

  // Register hover provider
  monaco.languages.registerHoverProvider('beatbax', {
    provideHover: (model, position) => {
      const waveHover = buildWaveHover(model, position);
      if (waveHover) return waveHover;

      const envelopeHover = buildEnvelopeHover(model, position);
      if (envelopeHover) return envelopeHover;

      const gmHover = buildGmHover(model, position);
      if (gmHover) return gmHover;

      const noteHover = buildNoteHover(model, position, latestChip);
      if (noteHover) return noteHover;

      const instPropertyKeywordHover = buildInstPropertyKeywordHover(model, position, latestChip);
      if (instPropertyKeywordHover) return instPropertyKeywordHover;

      const instPropertyHover = buildInstPropertyHover(model, position, latestChip);
      if (instPropertyHover) return instPropertyHover;

      const nesMacroHover = buildNesMacroHover(model, position, latestChip);
      if (nesMacroHover) return nesMacroHover;

      const word = model.getWordAtPosition(position);
      if (!word) return null;

      // Special-case chip directive values so hovering `atari-st` (etc.)
      // returns meaningful chip metadata instead of requiring hover on `chip`.
      const lineText = model.getLineContent(position.lineNumber);
      const chipValueMatch = /^\s*chip\s+([a-zA-Z][\w-]*)/.exec(lineText);
      if (chipValueMatch) {
        const rawChip = chipValueMatch[1];
        const valueStart = lineText.indexOf(rawChip) + 1;
        const valueEnd = valueStart + rawChip.length;
        if (position.column >= valueStart && position.column <= valueEnd) {
          const canonicalChip = chipRegistry.resolve(rawChip.toLowerCase());
          const plugin = chipRegistry.get(canonicalChip);
          const aliases = chipRegistry.aliasesFor(canonicalChip);
          const metadata = plugin?.newSongWizard?.metadata;

          const lines: string[] = [];
          lines.push(`**Chip target**: \`${rawChip}\``);
          lines.push(
            rawChip.toLowerCase() === canonicalChip
              ? `Canonical id: \`${canonicalChip}\``
              : `Resolves to canonical id: \`${canonicalChip}\``,
          );

          if (plugin) {
            lines.push(`Channels: **${plugin.channels}**`);
            if (aliases.length > 0) {
              lines.push(`Aliases: ${aliases.map((a) => `\`${a}\``).join(', ')}`);
            }
            if (metadata?.chipDisplayName) {
              lines.push(`Display: **${metadata.chipDisplayName}**`);
            }
            if (metadata?.platform) {
              lines.push(`Platform: **${metadata.platform}**`);
            }
            if (metadata?.channelSummary) {
              lines.push(metadata.channelSummary);
            }
          }

          lines.push('Example: `chip gameboy`, `chip atari-st`, `chip nes`, `chip famicom`');

          return {
            range: new monaco.Range(position.lineNumber, valueStart, position.lineNumber, valueEnd),
            contents: [{ value: lines.join('  \n') }],
          };
        }
      }

      // Build the chip hover doc dynamically so it always reflects installed plugins.
      const installedChips = (() => {
        const canonical = chipRegistry.listCanonical();
        return canonical.map((name) => {
          const plugin = chipRegistry.get(name);
          const aliases = chipRegistry.aliasesFor(name);
          const allNames = [name, ...aliases].map((n) => `\`${n}\``).join(', ');
          const meta = plugin?.newSongWizard?.metadata;
          const summary = meta?.chipDisplayName
            ? `${meta.chipDisplayName}${meta.platform ? ` (${meta.platform})` : ''}`
            : `${plugin?.channels ?? '?'} ch`;
          return `- ${allNames} — ${summary}`;
        }).join('\n');
      })();

      const hoverDocs: Record<string, string> = {
        chip: [
          '**chip** — sets the target audio chip for this song.',
          '```\nchip <chipId>\n```',
          '**Installed chips:**',
          installedChips,
          'Example: `chip gameboy`, `chip atari-st`, `chip nes`, `chip famicom`',
        ].join('\n\n'),
        bpm: 'Sets the tempo in beats per minute. Example: `bpm 120`',
        scale: [
          '**scale** — declares the global pitch set for scale-aware editing and validation.',
          '```\nscale <root> <mode> [warn|error|off]\n```',
          '- `<root>` — pitch class (`C`, `F#`, `Bb`, …)',
          '- `<mode>` — `major`, `minor`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `locrian`, `pentatonic_major`, `pentatonic_minor`, `blues`, `chromatic`',
          '- Enforcement: `warn` (default) — diagnostics only; `error` — block on violations; `off` — metadata only',
          '',
          'Example: `scale D dorian warn`',
          '',
          'Channels can opt in with `lock=<value>`: `scale`, `root+fifth`, `chord`, `chord7`, `octaves`',
        ].join('\n\n'),
        lock: [
          '**lock** — channel option restricting notes to a subset of the declared scale.',
          '```\nchannel N => inst <name> seq <name> lock=<value>\n```',
          '- `scale` — any note in the declared scale',
          '- `root+fifth` — root and fifth only (any octave)',
          '- `chord` — degrees 1, 3, 5',
          '- `chord7` — degrees 1, 3, 5, 7',
          '- `octaves` — root pitch class only',
          '',
          'Example: `channel 1 => inst lead seq main lock=root+fifth`',
        ].join('\n\n'),
        warn: 'Scale enforcement: emit diagnostics for out-of-scale notes (default). Example: `scale C major warn`',
        error: 'Scale enforcement: treat out-of-scale notes as errors. Example: `scale C major error`',
        dorian: 'Scale mode: dorian (natural minor with raised 6th). Example: `scale D dorian warn`',
        major: 'Scale mode: major (Ionian). Example: `scale C major warn`',
        minor: 'Scale mode: natural minor (Aeolian). Example: `scale A minor warn`',
        stepsPerBar: 'Sets steps per bar for bar/beat display (default 4). Example: `stepsPerBar 4`',
        time: '*(deprecated)* Alias for `stepsPerBar`. Still parsed; prefer `stepsPerBar`. Example: `time 4`',
        ticksPerStep:
          '*(deprecated, no effect)* Ignored by the engine. Use `stepsPerBar` for bar grouping. Example: `ticksPerStep 16`',
        inst: 'Declares a named instrument. Syntax: `inst <name> type=<channel-type> [...]`. Hover over type values or fields for chip-specific documentation.',
        pat: 'Defines a pattern. Example: `pat melody = C4 E4 G4 C5`',
        seq: [
          '**Sequence definition** — an ordered list of pattern references, each optionally with transforms.',
          '```\nseq <name> = <pat>[:<transform>[:…]] …\n```',
          '**Per-pattern transforms** (chainable with `:`):',
          '- `oct(+N)` / `oct(-N)` — shift octave up or down',
          '- `rot(N)` / `rotate(N)` — cyclic left-rotate tokens by N',
          '- `transpose(+N)` — shift by N semitones',
          '- `inst(<name>)` — override instrument for all notes in that pattern slot',
          '- `rev` — reverse the pattern',
          '- `pal` / `palindrome` — mirror forward+backward without duplicating pivot',
          '- `slow` — double each note duration',
          '- `fast` — halve each note duration',
          '- `arp(a,b,c)` — apply arpeggio semitone offsets above the root (omit 0; e.g. major `arp(4,7)`, minor `arp(3,7)`)',
          '- `clamp(C3,C6)` — clamp notes into a pitch range',
          '- `fold(C3,C6)` — octave-fold notes into a pitch range',
          '- `mute` / `rest` — replace notes with rests, preserving rhythm',
          '- `<effectName>` — apply a named effect preset to every note',
          '',
          '**Tier-2 transforms** (also chainable with `:`):',
          '- `invert` / `inv` — mirror pitch contour around the first note (pivot)',
          '- `every(N,MOD)` — apply MOD to every Nth token (1-based: N, 2N, 3N, …)',
          '- `off(N)` / `lag(N)` — prepend N rest tokens before the pattern',
          '- `pick(1,3,…)` — keep only the listed 1-based token positions',
          '- `chunk(N)` — split into chunks of N and reverse each chunk',
          '- `shuffle(seed)` — deterministic reorder (seed fixes the permutation)',
          '',
          'Examples:',
          '```\nseq main  = intro melody:oct(-1) chorus:rev\nseq bass  = bass_pat:inst(bass_deep):oct(-1)\nseq combo = melody:oct(-1):fast       # chained transforms\nseq laggy = lead:rot(1):lag(1)        # rotate, then one-step pickup\n```',
        ].join('\n\n'),
        channel: 'Maps a sequence to a channel. Example: `channel 1 => inst lead seq main`',
        play: 'Starts playback',
        export: 'Exports song to format. Example: `export midi "song.mid"`',
        import: 'Imports instruments from file. Example: `import "local:lib/instruments.ins"` or `import "github:user/repo/file.ins"`',
        volume: 'Sets global volume (0.0-1.0). Example: `volume 0.8`',
        oct: [
          '**Octave shift** — move every note up or down by whole octaves.',
          '```\noct(+N)\noct(-N)\n```',
          '- `N` — signed octave count (each step = 12 semitones, not single semitones)',
          '- Rests, `inst(...)` tokens, and non-note tokens are left unchanged',
          '',
          'Example: `lead_core:oct(-1)` — drop a melody one octave for a bass line',
          '',
          'Example: `melody:oct(+1):rev` — up an octave, then reverse token order',
        ].join('\n\n'),
        rot: [
          '**Rotate** — cyclic left-shift of pattern tokens by N positions.',
          '```\nrot(N)\n```',
          '- `N` — positions to shift left (wraps modulo length; use negative N to shift right)',
          '- Empty patterns are unchanged; `rot(0)` is a no-op',
          '',
          'Example: `lead_core:rot(1)` on `[C4 D4 E4 G4]` → `[D4 E4 G4 C4]`',
          '',
          'Moves the perceived downbeat to a different note in the loop.',
          '',
          'Chain for canon-style entries: `lead_core:rot(1):lag(1)`',
        ].join('\n\n'),
        rotate: [
          '**Rotate** — alias for `rot`.',
          '```\nrotate(N)\n```',
          '',
          'Example: `lead_core:rotate(2)` on `[C4 D4 E4 G4]` → `[E4 G4 C4 D4]`',
          '',
          'See **rot** for full behaviour and chaining notes.',
        ].join('\n\n'),
        rev: [
          '**Reverse** — play all tokens in reverse order.',
          '```\nrev\n```',
          '- Rests (`.`) and sustain tokens (`_`) reverse with the notes',
          '- Inline effects on each token stay attached to that token',
          '',
          'Example: `lead_core:rev` on `[C4 D4 E4 G4]` → `[G4 E4 D4 C4]`',
          '',
          'Example: `intro:rev` after `verse` in a seq for a mirrored outro feel',
        ].join('\n\n'),
        pal: [
          '**Palindrome** — play forward, then backward without repeating the last note.',
          '```\npal\npalindrome\n```',
          '- The pivot (last note of the forward pass) is not duplicated',
          '- Rests and effects reverse with their tokens',
          '',
          'Example: `lead_core:pal` on `[C4 D4 E4 G4]` → `[C4 D4 E4 G4 E4 D4 C4]`',
          '',
          'Doubles melodic length — useful for intros, fills, or symmetrical phrases.',
        ].join('\n\n'),
        palindrome: [
          '**Palindrome** — alias for `pal`.',
          '```\npalindrome\n```',
          '',
          'Example: `lead_core:palindrome` — same result as `lead_core:pal`',
          '',
          'See **pal** for full behaviour.',
        ].join('\n\n'),
        slow: [
          '**Slow** — stretch timing by repeating each token.',
          '```\nslow\nslow(N)\n```',
          '- Default factor **2** — each token appears twice in a row',
          '- `slow(N)` — repeat every token N times (N ≥ 1)',
          '',
          'Example: `lead_core:slow` on `[C4 D4 E4 G4]` → `[C4 C4 D4 D4 E4 E4 G4 G4]`',
          '',
          'Step count doubles (default); pair with `fast` or use in half-time sections.',
        ].join('\n\n'),
        fast: [
          '**Fast** — compress timing by keeping every Nth token.',
          '```\nfast\nfast(N)\n```',
          '- Default factor **2** — keep indices 0, 2, 4, …',
          '- `fast(N)` — keep tokens at indices 0, N, 2N, …',
          '',
          'Example: `lead_core:fast` on 8 tokens → 4 tokens (half the steps)',
          '',
          'Opposite of `slow`; thins a dense pattern or restores tempo after `slow`.',
        ].join('\n\n'),
        transpose: [
          '**Transpose** — shift every note by N semitones.',
          '```\ntranspose(+N)\ntranspose(-N)\nsemitone(N)  st(N)  trans(N)\n+7   -3\n```',
          '- Signed semitone offset applied to all note tokens',
          '- Bare `+N` / `-N` after `:` is shorthand for the same thing',
          '- Aliases: `semitone`, `st`, `trans`',
          '',
          'Example: `lead_core:transpose(+2)` on `[C4 D4 E4 G4]` → `[D4 E4 F#4 A4]`',
          '',
          'Combine with octave moves: `melody:oct(-1):transpose(+5)`',
        ].join('\n\n'),
        semitone: [
          '**Transpose** — alias for `transpose`.',
          '```\nsemitone(+N)\n```',
          '',
          'Example: `lead_core:semitone(+2)` — same as `lead_core:transpose(+2)`',
          '',
          'See **transpose** for shorthand (`+N`/`-N`) and chaining.',
        ].join('\n\n'),
        st: [
          '**Transpose** — short alias for `transpose`.',
          '```\nst(+N)\n```',
          '',
          'Example: `lead_core:st(-3)` — drop three semitones',
          '',
          'See **transpose** for full syntax.',
        ].join('\n\n'),
        trans: [
          '**Transpose** — alias for `transpose`.',
          '```\ntrans(+N)\n```',
          '',
          'Example: `lead_core:trans(+2)` — same as `transpose(+2)`',
          '',
          'See **transpose** for full syntax.',
        ].join('\n\n'),
        clamp: [
          '**Clamp** — clip every note into a fixed pitch range (hard limits).',
          '```\nclamp(minNote,maxNote)\n```',
          '- Notes below `minNote` are raised to the minimum; above `maxNote` are lowered',
          '- Out-of-range notes are **cut**, not wrapped',
          '',
          'Example: `out_of_range:clamp(C3,C6)` on `[A2 C4 E6 A6]` → `[C3 C4 C6 C6]`',
          '',
          'Use when you need strict ceiling/floor (bass lines, chip range safety).',
        ].join('\n\n'),
        fold: [
          '**Fold** — octave-wrap notes into a pitch range instead of clipping.',
          '```\nfold(minNote,maxNote)\n```',
          '- Notes below the range fold **up** by octaves; above fold **down**',
          '- Unlike `clamp`, pitches stay musically related to the source',
          '',
          'Example: `out_of_range:fold(C3,C6)` on `[A2 C4 E6 A6]` → notes land inside C3–C6',
          '',
          'Pair with `clamp` when you want wrap vs hard cut on the same source pattern.',
        ].join('\n\n'),
        mute: [
          '**Mute** — replace every note token with a rest, preserving rhythm.',
          '```\nmute\nrest\n```',
          '- Rest tokens (`.`) and sustain tokens (`_`) are unchanged',
          '- Step count stays the same — only pitch content is silenced',
          '',
          'Example: `lead_core:mute` on `[C4 D4 E4 G4]` → `[. . . .]`',
          '',
          'Use for rhythmic ghost tracks or with `every(N,mute)` for alternating silence.',
        ].join('\n\n'),
        rest: [
          '**Rest** — alias for `mute`.',
          '```\nrest\n```',
          '',
          'Example: `lead_core:rest` — same as `lead_core:mute`',
          '',
          'See **mute** for behaviour and `every(N,mute)` patterns.',
        ].join('\n\n'),
        invert: [
          '**Invert** — mirror the pitch contour around the first note (pivot).',
          'Each subsequent note\'s interval from the pivot is negated.',
          '```\ninvert\ninv\n```',
          '',
          'Example: `lead_core:invert` where lead_core is `C4 D4 E4 G4` → `C4 A#3 G#3 F3`',
          '',
          'Chain with `rot` for call-and-response: `lead_core:rot(2):inv`',
        ].join('\n\n'),
        inv: [
          '**Invert** — alias for `invert`.',
          '```\ninv\n```',
          '',
          'Example: `lead_core:rot(2):inv` — rotate, then mirror around the new first note',
          '',
          'See **invert** for pivot behaviour and pitch examples.',
        ].join('\n\n'),
        every: [
          '**Every** — apply a nested modifier to every Nth token (1-based).',
          '```\nevery(N,MOD)\n```',
          '- `N` — interval (positions N, 2N, 3N, … receive MOD)',
          '- `MOD` — any sequence transform, e.g. `oct(+1)`, `mute`',
          '',
          'Example: `lead_core:every(2,oct(+1))` — 2nd and 4th notes jump up an octave',
          '',
          'Example: `lead_core:every(2,mute)` — silence every other note',
        ].join('\n\n'),
        off: [
          '**Off (scale enforcement)** — store scale metadata only, no diagnostics.',
          'Example: `scale C major off`',
          '',
          '**Off (sequence transform)** — prepend N rest tokens before the pattern (pickup delay).',
          '```\noff(N)\n```',
          '- `N` — number of rest steps to insert at the start (0 = no change)',
          '',
          'Example: `lead_core:off(2)` → `.. C4 D4 E4 G4` (two-step late entry)',
          '',
          'Combine with `rot` for staggered canon entries: `lead_core:rot(1):off(1)`',
        ].join('\n\n'),
        lag: [
          '**Lag** — alias for `off`: prepend N rest tokens before the pattern.',
          '```\nlag(N)\n```',
          '',
          'Example: `lead_core:lag(1)` → one rest, then the pattern tokens',
          '',
          'Example: `lead_core:rot(1):lag(1)` — rotate first, then one-step pickup',
        ].join('\n\n'),
        pick: [
          '**Pick** — keep only the specified 1-based token positions.',
          '```\npick(1,3,5,...)\n```',
          '- Positions are 1-based; out-of-range indices are ignored',
          '',
          'Example: `lead_core:pick(1,3)` from `[C4 D4 E4 G4]` → `[C4 E4]`',
          '',
          'Example: `lead_core:pick(2,4)` → offbeat accents `[D4 G4]`',
        ].join('\n\n'),
        chunk: [
          '**Chunk** — split tokens into chunks of N and reverse each chunk.',
          '```\nchunk(N)\n```',
          '- `N` — chunk size (≥ 1)',
          '',
          'Example: `lead_core:chunk(2)` on `[C4 D4 E4 G4]` → `[D4 C4 G4 E4]`',
          '',
          'Example: `lead_core:rot(1):chunk(2)` — rotate, then reverse each pair',
        ].join('\n\n'),
        shuffle: [
          '**Shuffle** — deterministic Fisher-Yates reorder using a fixed seed.',
          '```\nshuffle(seed)\n```',
          '- `seed` — integer seed; same seed always yields the same permutation',
          '',
          'Example: `lead_core:shuffle(42)` — reproducible variation every run/export',
          '',
          'Use different seeds for different sections while keeping output stable.',
        ].join('\n\n'),
        effect: 'Defines a named effect preset. Example: `effect shimmer = vib:3,6`\nUse inline as `C4<shimmer>` in a pattern.',
        // Built-in inline effects
        arp: [
          '**Arpeggio** — rapid pitch cycling through semitone offsets above each note.',
          '',
          '**Inline (pattern):** append to a note token',
          '```\nC4<arp:4,7>\narp:<offset1>,<offset2>[,<offset3>,...]\n```',
          '- Offsets are semitones above the root; omit `0` (root is implicit)',
          '- Example: `C4<arp:4,7>` → C–E–G major arpeggio per step',
          '',
          '**Sequence transform:** apply arp to every note in a pattern slot',
          '```\npatName:arp(4,7)\n```',
          '- Same offset list as inline form; merged into each note token',
          '- Example: `arp_source:arp(4,7)` — each step in the pattern gets `<arp:4,7>`',
          '',
          '**Export:** JSON ✓  MIDI ✓  UGE ✓ (0xy, max 15 semitones per nibble)  Audio ✓',
        ].join('\n\n'),
        vib: [
          '**Vibrato** — periodically wobbles pitch with a frequency LFO.',
          '```\nvib:<depth>,<rate>[,<waveform>[,<duration>[,<delayRows>]]]\n```',
          '- `depth` — modulation depth 0–15 (higher = wider wobble)',
          '- `rate` — LFO speed in Hz',
          '- `waveform` — `sine` (default) · `triangle` · `square` · `saw`',
          '- `duration` — rows the effect is active (default: full note)',
          '- `delayRows` — rows before LFO starts; 0 = immediate (default: 0)',
          '',
          'Example: `C4<vib:4,6,sine,4,1>` — depth 4, rate 6 Hz, sine, 4 rows, 1-row onset delay',
          '',
          '**Export:** JSON ✓  MIDI ✓ (CC1)  UGE ✓ (4xy, delay via row omission)  Audio ✓',
        ].join('\n\n'),
        port: [
          '**Portamento** — slides pitch from the previous note to the current one.',
          '```\nport:<speed>\n```',
          '- `speed` — slide speed in ticks (higher = slower glide)',
          '',
          'Example: `E4<port:8>` — slides from previous pitch to E4 at speed 8',
          '',
          '*Note: ignored on the first note (no prior pitch to slide from).*',
          '',
          '**Export:** JSON ✓  MIDI ✓  UGE ✓ (1xx up / 2xx down)  Audio ✓',
        ].join('\n\n'),
        volSlide: [
          '**Volume Slide** — ramps volume up or down over the note duration.',
          '```\nvolSlide:<delta>[,<steps>]\n```',
          '- `delta` — volume change per tick (positive = fade in, negative = fade out)',
          '- `steps` — discrete step count instead of continuous slide (optional)',
          '',
          'Example: `C4<volSlide:-3>` — fade out;  `C4<volSlide:+8,4>` — stepped fade in (4 steps)',
          '',
          '**Export:** JSON ✓  MIDI ✓ (CC7)  UGE ✓ (Axy)  Audio ✓',
        ].join('\n\n'),
        trem: [
          '**Tremolo** — periodically varies volume with a gain LFO.',
          '```\ntrem:<depth>,<rate>[,<waveform>[,<duration>[,<delayRows>]]]\n```',
          '- `depth` — modulation depth 0–15 (higher = more pronounced)',
          '- `rate` — LFO speed in Hz',
          '- `waveform` — `sine` (default) · `triangle` · `square` · `saw`',
          '- `duration` — rows the effect is active (default: full note)',
          '- `delayRows` — rows before LFO starts; 0 = immediate (default: 0)',
          '',
          'Example: `C4<trem:8,6,sine,0,1>` — depth 8, rate 6 Hz, 1-row onset delay',
          '',
          '**Export:** JSON ✓  MIDI ✓ (CC7)  UGE ✗ (no hUGETracker tremolo effect)  Audio ✓',
        ].join('\n\n'),
        pan: [
          '**Panning** — sets stereo position for a note or an entire pattern slot.',
          '',
          '**Inline (pattern):** per-note pan',
          '```\nC4<pan:L>\npan:<position>\n```',
          '- `position` — `L` · `C` · `R` · or float −1.0 to +1.0',
          '',
          '**Sequence transform:** pan all notes in a pattern reference',
          '```\npatName:pan(L)\n```',
          '- Emits `pan(L)` before the pattern tokens and `pan()` after to reset',
          '- Example: `melody:pan(R)` — whole phrase hard-panned right',
          '',
          '**Export:** JSON ✓  MIDI ✓  UGE ✓ (8xx NR51)  Audio ✓',
        ].join('\n\n'),
        echo: [
          '**Echo / Delay** — adds a time-delayed repeat of the note.',
          '```\necho:<delay>,<feedback>,<mix>\n```',
          '- `delay` — delay duration in beats (e.g. `0.25` = dotted-eighth at current BPM)',
          '- `feedback` — signal fed back into delay line, 0–100 %',
          '- `mix` — wet/dry mix percentage, 0–100 %',
          '',
          'Example: `C4<echo:0.25,40,30>` — 125 ms delay, 40 % feedback, 30 % wet',
          '',
          '**Export:** JSON ✓  MIDI ✗  UGE ✗ (no hUGETracker echo)  Audio ✓',
        ].join('\n\n'),
        retrig: [
          '**Retrigger** — rapidly re-triggers the note at a fixed interval.',
          '```\nretrig:<interval>[,<volumeDelta>]\n```',
          '- `interval` — ticks between each re-trigger (required)',
          '- `volumeDelta` — volume change applied per re-trigger, e.g. `−2` for fade-out (optional)',
          '',
          'Example: `C4<retrig:2>` — stutter every 2 ticks;  `C4<retrig:4,-3>` — with volume decay',
          '',
          '**Export:** JSON ✓  MIDI ✗  UGE ✗ (7xx = note delay, not retrigger)  Audio ✓',
        ].join('\n\n'),
        bend: [
          '**Pitch Bend** — smoothly slides pitch by a set number of semitones.',
          '```\nbend:<semitones>[,<curve>[,<delay>[,<time>]]]\n```',
          '- `semitones` — target offset in semitones (`+` up, `−` down)',
          '- `curve` — interpolation shape: `linear` (default) · `exp` · `log` · `sine`',
          '- `delay` — onset as fraction of note duration (0 = immediate, 0.5 = halfway, default 0.5)',
          '- `time` — bend duration in beats (optional; defaults to rest of note)',
          '',
          'Example: `C4<bend:+7,exp,0>` — octave-fifth rise, exponential, starts immediately',
          '',
          '**Export:** JSON ✓  MIDI ✓  UGE ✓ (3xx portamento approx; non-linear/delay → warning)  Audio ✓',
        ].join('\n\n'),
        cut: [
          '**Note Cut** — silences the note after a set number of ticks.',
          '```\ncut:<ticks>\n```',
          '- `ticks` — ticks after note-on before the note is cut (0 = immediate)',
          '',
          'Example: `C4<cut:4>` — play for 4 ticks then cut',
          '',
          '**Export:** JSON ✓  MIDI ✓ (note-off at cut position)  UGE ✓ (ECx)  Audio ✓',
        ].join('\n\n'),
      };

      const doc =
        (chipRegistry.get(latestChip)?.uiContributions?.hoverDocs ?? {})[word.word]
        ?? hoverDocs[word.word];
      if (doc) {
        return {
          contents: [{ value: doc }],
        };
      }

      if (
        word.word === 'gm'
        && /^\s*inst\s+/.test(lineText)
        && !lineText.slice(word.startColumn - 1).match(/^gm\s*=/)
      ) {
        return {
          contents: [{
            value: [
              '**gm** — General MIDI program number (**0–127**) for MIDI export.',
              '',
              'Sets the Program Change message used when this instrument is exported to MIDI.',
              'Hover a value like `gm=81` to see the patch name.',
              '',
              'Example: `inst lead type=pulse1 duty=50 gm=81`',
            ].join('\n'),
          }],
        };
      }

      if (
        word.word === 'note'
        && /^\s*inst\s+/.test(lineText)
        && !lineText.slice(word.startColumn - 1).match(/^note\s*=/)
      ) {
        return {
          contents: [{
            value: [
              '**note** — default pitch for named hit tokens on this instrument.',
              '',
              'When a pattern uses the instrument name directly (`kick`, `snare`, `hihat`, …), playback and export use this note instead of requiring an explicit pitch in the pattern.',
              'Hover a value like `note=C7` to see MIDI number, frequency, and export mapping.',
              '',
              'Example: `inst snare type=noise gb:width=7 env=13,down note=C7`',
            ].join('\n'),
          }],
        };
      }

      // Skip instrument/effect hovers if cursor is inside a quoted string (e.g., metadata)
      if (isPositionInString(model, position)) {
        return null;
      }

      if (latestAST?.insts && latestAST.insts[word.word]) {
        const inst = latestAST.insts[word.word] as Record<string, unknown>;
        const props: string[] = [];
        const skip = new Set(['__loc', 'loc']);

        for (const [key, value] of Object.entries(inst)) {
          if (skip.has(key) || value === undefined || value === null) continue;
          if (Array.isArray(value)) {
            props.push(`${key}=[${value.join(',')}]`);
          } else if (typeof value === 'object') {
            props.push(`${key}=${JSON.stringify(value)}`);
          } else {
            props.push(`${key}=${value}`);
          }
        }

        return {
          contents: [
            { value: `**Instrument**: \`${word.word}\`` },
            { value: '```beatbax\n' + props.join(' ') + '\n```' },
          ],
        };
      }

      if (latestAST?.effects && latestAST.effects[word.word]) {
        const effectVal = latestAST.effects[word.word];
        return {
          contents: [
            { value: `**Named Effect**: \`${word.word}\`` },
            { value: "```beatbax\neffect " + word.word + " = " + effectVal + "\n```" }
          ]
        };
      }

      return null;
    },
  });

  // Register document highlight provider.
  // Returns empty highlights for note tokens (C4, Bb3, G5 etc.) so that
  // clicking a note does not light up every other note in the file.
  // For all other identifiers (pattern/sequence/instrument names) every
  // whole-word occurrence is highlighted as normal.
  monaco.languages.registerDocumentHighlightProvider('beatbax', {
    provideDocumentHighlights: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      // Note tokens: natural (C3) or flat (Bb4, Ab3).
      // Sharp notes (C#4) are split by '#' so getWordAtPosition returns just
      // 'C' or '4' — neither matches, so they're left to the fallback below.
      if (/^[A-G]b?[0-8]$/.test(word.word)) {
        return [];
      }

      // For identifiers, highlight every whole-word occurrence in the document.
      const escaped = word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = model.findMatches(
        `\\b${escaped}\\b`,
        false, // searchOnlyEditableRange
        true,  // isRegex
        true,  // matchCase
        null,  // wordSeparators
        false, // captureMatches
      );

      return matches.map((match) => ({
        range: match.range,
        kind: monaco.languages.DocumentHighlightKind.Text,
      }));
    },
  });

  // Register document semantic tokens provider for colorizing parsed entities
  const semanticTokenTypes = ['instrument', 'pattern', 'sequence'];
  monaco.languages.registerDocumentSemanticTokensProvider('beatbax', {
    onDidChange: semanticTokensChangedEmitter.event,
    getLegend: function () {
      return {
        tokenTypes: semanticTokenTypes,
        tokenModifiers: [],
      };
    },
    provideDocumentSemanticTokens: function (model, lastResultId, token) {
      const versionId = model.getVersionId();

      // Fast path: same model version → return cached tokens without re-parsing
      if (tokenCache && tokenCache.versionId === versionId) {
        return { data: tokenCache.data, resultId: undefined };
      }

      // Use the AST already produced by the editor's parse:success subscriber to
      // avoid a redundant parse on the hot typing path.  Fall back to a fresh
      // parse only when no cached AST is available (e.g. on first load).
      let ast = latestAST;
      if (!ast) {
        const code = model.getValue();
        try {
          ast = parse(code);
        } catch (e) {
          // Return empty if parse fails, keeping old colors or falling back to Monarch
          return null;
        }
      }

      const instruments = new Set(Object.keys(ast.insts || {}));
      const patterns = new Set(Object.keys(ast.pats || {}));
      const sequences = new Set(Object.keys(ast.seqs || {}));

      const lines = model.getLinesContent();
      const tokens: number[] = [];
      let prevLine = 0;
      let prevChar = 0;
      let quoteState: QuoteScanState = { inDouble: false, inTriple: false };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineStartState = quoteState;

        // Skip comments early
        const commentIdx = line.indexOf('#');
        const textToSearch = commentIdx !== -1 ? line.substring(0, commentIdx) : line;

        const regex = /[a-zA-Z_]\w*/g;
        let match;
        while ((match = regex.exec(textToSearch)) !== null) {
          const word = match[0];

          let typeIdx = -1;
          if (instruments.has(word)) typeIdx = 0;
          else if (patterns.has(word)) typeIdx = 1;
          else if (sequences.has(word)) typeIdx = 2;

          if (typeIdx !== -1) {
            // Skip semantic coloring if this identifier is inside a quoted string (metadata)
            const matchColumn = match.index + 1; // Monaco columns are 1-indexed
            const preToken = line.substring(0, Math.max(0, matchColumn - 1));
            const tokenState = scanQuoteState(preToken, lineStartState);
            if (tokenState.inDouble || tokenState.inTriple) {
              continue;
            }

            const startChar = match.index;
            const length = word.length;

            const deltaLine = i - prevLine;
            const deltaChar = deltaLine === 0 ? startChar - prevChar : startChar;

            tokens.push(deltaLine, deltaChar, length, typeIdx, 0);

            prevLine = i;
            prevChar = startChar;
          }
        }

        quoteState = scanQuoteState(line, lineStartState);
      }

      const result = new Uint32Array(tokens);
      tokenCache = { versionId, data: result };
      return {
        data: result,
        resultId: undefined,
      };
    },
    releaseDocumentSemanticTokens: function (resultId) {},
  });

  // Define custom theme that styles our sequence modifiers
  monaco.editor.defineTheme('beatbax-dark', {
    base: 'vs-dark',
    inherit: true,
    // @ts-expect-error - Some monaco versions are missing this in types
    semanticHighlighting: true,
    rules: [
      { token: 'instrument', foreground: 'FFB86C' }, // Distinct Orange for semantic instruments
      { token: 'pattern', foreground: '8BE9FD' }, // Cyan for semantic patterns
      { token: 'sequence', foreground: '50FA7B' }, // Green for semantic sequences
      { token: 'function', foreground: 'C678DD' }, // Bright magenta/purple - inline effects
      { token: 'entity.name.function', foreground: 'C678DD' }, // Bright magenta/purple - sequence modifiers and effect presets
      { token: 'variable.name', foreground: 'DCDCAA' }, // Yellow - definition names (lead, melody, main, ambient)
      { token: 'attribute', foreground: '9CDCFE' }, // Light blue - property names (type, duty, env) and JSON keys
      { token: 'string', foreground: 'CE9178' }, // Orange - string values
      { token: 'number', foreground: 'CE9178' }, // Orange - numbers and values
      { token: 'number.note', foreground: '4EC9B0' }, // Cyan/teal - notes (stands out)
      { token: 'number.rest', foreground: '6A6A6A' }, // Dark gray - rests
      { token: 'constant.language', foreground: '4EC9B0' }, // Cyan/teal - URI schemes (local, https)
      { token: 'type', foreground: 'CE9178' }, // Orange - instrument types, export formats
      { token: 'identifier', foreground: 'DCDCAA' }, // Yellow - identifiers (instrument/pattern/seq references)
      { token: 'operator', foreground: 'D4D4D4' }, // White/gray - operators
      { token: 'delimiter', foreground: '808080' }, // Gray - delimiters
      { token: 'keyword', foreground: 'C8A227' }, // Amber - keywords like pat, seq, inst
      { token: 'keyword.deprecated', foreground: 'CCA700', fontStyle: 'italic' }, // Deprecated directives (time, ticksPerStep)
      { token: 'keyword.channel.1', foreground: '569CD6' }, // Pulse 1 — blue
      { token: 'keyword.channel.2', foreground: '9CDCFE' }, // Pulse 2 — light blue
      { token: 'keyword.channel.3', foreground: '4EC9B0' }, // Wave    — teal
      { token: 'keyword.channel.4', foreground: 'CE9178' }, // Noise   — salmon
      { token: 'keyword.control', foreground: 'C586C0' }, // Purple - play, export
      { token: 'comment', foreground: '6A9955' }, // Typical green - comments
    ],
    colors: {
      'editorCursor.foreground': 'AEAFAD', // Explicit cursor color for dark mode (light gray)
    },
  });

  // Define light theme
  monaco.editor.defineTheme('beatbax-light', {
    base: 'vs',
    inherit: true,
    // @ts-expect-error - Some monaco versions are missing this in types
    semanticHighlighting: true,
    rules: [
      { token: 'instrument', foreground: 'D97706' }, // Darker orange
      { token: 'pattern', foreground: '0284C7' }, // Blue/Cyan
      { token: 'sequence', foreground: '16A34A' }, // Green
      { token: 'function', foreground: '9333EA' }, // Purple
      { token: 'entity.name.function', foreground: '9333EA' }, // Bright magenta/purple
      { token: 'variable.name', foreground: '795E26' }, // Yellow - definition names
      { token: 'attribute', foreground: '001080' }, // Light blue - property names
      { token: 'string', foreground: 'A31515' }, // Orange - string values
      { token: 'number', foreground: '098658' }, // Orange - numbers
      { token: 'number.note', foreground: '007ACC' }, // Cyan - notes
      { token: 'number.rest', foreground: '808080' }, // Gray - rests
      { token: 'constant.language', foreground: '007ACC' }, // Cyan - URIs
      { token: 'type', foreground: '267F99' }, // Orange - types
      { token: 'identifier', foreground: '001080' }, // Yellow - identifiers
      { token: 'operator', foreground: '000000' }, // White/gray - operators
      { token: 'delimiter', foreground: '000000' }, // Gray - delimiters
      { token: 'keyword', foreground: '9A7110' }, // Amber - keywords
      { token: 'keyword.deprecated', foreground: '9A7110', fontStyle: 'italic' }, // Deprecated directives (time, ticksPerStep)
      { token: 'keyword.channel.1', foreground: '1565C0' }, // Pulse 1 — darker blue
      { token: 'keyword.channel.2', foreground: '0277BD' }, // Pulse 2 — mid blue
      { token: 'keyword.channel.3', foreground: '00796B' }, // Wave    — darker teal
      { token: 'keyword.channel.4', foreground: 'BF360C' }, // Noise   — darker salmon
      { token: 'keyword.control', foreground: 'AF00DB' }, // Purple - keywords
      { token: 'comment', foreground: '008000' }, // Green - comments
    ],
    colors: {
      'editorCursor.foreground': '000000', // Explicit cursor color for light mode (black)
    },
  });

  // ── Document formatter ────────────────────────────────────────────────────
  monaco.languages.registerDocumentFormattingEditProvider('beatbax', {
    provideDocumentFormattingEdits(model) {
      const text = model.getValue();
      const lines = text.split('\n');
      const out: string[] = [];
      let prevWasBlank = false;

      for (let i = 0; i < lines.length; i++) {
        // Strip trailing whitespace only
        const line = lines[i].replace(/\s+$/, '');

        const isBlank = line.trim() === '';
        const isTopLevel = isTopLevelBaxLine(line);

        // Insert a blank line before each top-level statement (except at start)
        if (isTopLevel && out.length > 0 && !prevWasBlank) {
          out.push('');
        }

        // Collapse multiple consecutive blank lines to one
        if (isBlank && prevWasBlank) continue;

        out.push(line);
        prevWasBlank = isBlank;
      }

      // Remove trailing blank lines
      while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();

      const formatted = out.join('\n') + '\n';
      const fullRange = model.getFullModelRange();
      return [{ range: fullRange, text: formatted }];
    },
  });

  registerBeatBaxCodeActions();
}

// ─── Note transposition helpers ──────────────────────────────────────────────

const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B',
};

interface NoteToken {
  note: string;
  range: monaco.IRange;
}

/**
 * Detect the note token (C4, Bb4, C#4, …) at `position`.
 * Sharp notes straddle a word boundary because `#` is a word separator, so we
 * inspect the character immediately after the word when needed.
 */
function getNoteAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
): NoteToken | null {
  const word = model.getWordAtPosition(position);
  if (!word) return null;

  // Natural / flat note: e.g. C4, Bb4, Ab3
  if (/^[A-G]b?[0-8]$/.test(word.word)) {
    return {
      note: word.word,
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      },
    };
  }

  // Sharp note: word is just the letter (e.g. "C"), next chars should be "#<digit>"
  // word.endColumn is 1-based exclusive → string index is word.endColumn - 1
  if (/^[A-G]$/.test(word.word)) {
    const lineContent = model.getLineContent(position.lineNumber);
    const afterWord = lineContent.substring(word.endColumn - 1);
    const sharpMatch = afterWord.match(/^#([0-8])/);
    if (sharpMatch) {
      return {
        note: word.word + '#' + sharpMatch[1],
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn + 2, // '#' + octave digit
        },
      };
    }
  }

  return null;
}

/**
 * Transpose `note` by `semitones` half-steps.
 * Returns the new note string, or `null` if the result falls outside C0–B8.
 * Flat input notes are output as their sharp equivalent (Bb → A#).
 */
function transposeNote(note: string, semitones: number): string | null {
  const match = note.match(/^([A-G][#b]?)([0-8])$/);
  if (!match) return null;

  let pitchClass = match[1];
  const octave = parseInt(match[2], 10);

  if (FLAT_TO_SHARP[pitchClass]) pitchClass = FLAT_TO_SHARP[pitchClass];

  const idx = CHROMATIC_SCALE.indexOf(pitchClass);
  if (idx === -1) return null;

  const midiStep = octave * 12 + idx + semitones;
  const newOctave = Math.floor(midiStep / 12);
  const newIdx = ((midiStep % 12) + 12) % 12;

  if (newOctave < 0 || newOctave > 8) return null; // out of C0–B8 range

  return CHROMATIC_SCALE[newIdx] + newOctave;
}

/**
 * Apply a transposition to the note under the cursor.
 * Silently no-ops if the cursor is not on a note or the result is out of range.
 */
export function transposeCurrentNote(
  editor: monaco.editor.IStandaloneCodeEditor,
  semitones: number,
): void {
  const model = editor.getModel();
  const position = editor.getPosition();
  if (!model || !position) return;

  const token = getNoteAtPosition(model, position);
  if (!token) return;

  const newNote = transposeNote(token.note, semitones);
  if (!newNote) return;

  editor.executeEdits('note-transpose', [{ range: token.range, text: newNote }]);

  // Restore cursor inside the replacement token at the same relative offset
  const offset = Math.min(position.column - token.range.startColumn, newNote.length - 1);
  editor.setPosition({ lineNumber: position.lineNumber, column: token.range.startColumn + offset });
}

/**
 * Register note-transposition key commands on a Monaco editor instance.
 *
 * | Shortcut      | Action        |
 * | ------------- | ------------- |
 * | Alt+.         | Semitone up   |
 * | Alt+,         | Semitone down |
 * | Alt+Shift+.   | Octave up     |
 * | Alt+Shift+,   | Octave down   |
 *
 * Commands are editor-scoped and only fire when the editor has focus.
 */
export function registerNoteEditCommands(
  editor: monaco.editor.IStandaloneCodeEditor,
): void {
  const { KeyMod, KeyCode } = monaco;

  editor.addCommand(KeyMod.Alt | KeyCode.Period,                       () => transposeCurrentNote(editor,  1));
  editor.addCommand(KeyMod.Alt | KeyCode.Comma,                        () => transposeCurrentNote(editor, -1));
  editor.addCommand(KeyMod.Alt | KeyMod.Shift | KeyCode.Period,        () => transposeCurrentNote(editor,  12));
  editor.addCommand(KeyMod.Alt | KeyMod.Shift | KeyCode.Comma,         () => transposeCurrentNote(editor, -12));
}
