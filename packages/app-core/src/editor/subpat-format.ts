/**
 * Format native Game Boy `subpat` rows back into BeatBax source for hovers.
 * Inverse of the SubPatRow grammar in packages/engine/src/parser/peggy/grammar.peggy.
 */

export interface SubPatternRowLike {
  empty?: boolean;
  offset?: number | null;
  vol?: number;
  jump?: number;
  halt?: boolean;
  fx?: { code: number; param: number };
  timbre?: number;
}

function signedOffset(offset: number): string {
  return offset >= 0 ? `+${offset}` : String(offset);
}

type SubPatTok =
  | { kind: 'dot' }
  | { kind: 'offset'; value: number }
  | { kind: 'vol'; value: number }
  | { kind: 'jump'; value: number }
  | { kind: 'timbre'; value: number }
  | { kind: 'halt' }
  | { kind: 'fx'; code: number; param: number };

function fxNum(raw: string): number {
  return /[A-Fa-f]/.test(raw) ? parseInt(raw, 16) : parseInt(raw, 10);
}

/** Lex one or more SubPatRow texts. Commas and whitespace separate rows; `fx:` keeps its comma. */
function lexSubPatternRows(text: string): SubPatTok[] | null {
  const token = /\.|halt(?![A-Za-z0-9_-])|[+-]?\d+|vol:\d+|jump:\d+|timbre:\d+|fx:[0-9A-Fa-f]+,[0-9A-Fa-f]+/g;
  const out: SubPatTok[] = [];
  let last = 0;
  for (const match of text.matchAll(token)) {
    const gap = text.slice(last, match.index);
    if (match.index !== last && !/[\s,]/.test(gap)) return null;
    if (!/^[\s,]*$/.test(gap)) return null;
    const part = match[0];
    if (part === '.') out.push({ kind: 'dot' });
    else if (part === 'halt') out.push({ kind: 'halt' });
    else if (/^[+-]?\d+$/.test(part)) out.push({ kind: 'offset', value: parseInt(part, 10) });
    else if (part.startsWith('vol:')) out.push({ kind: 'vol', value: parseInt(part.slice(4), 10) });
    else if (part.startsWith('jump:')) out.push({ kind: 'jump', value: parseInt(part.slice(5), 10) });
    else if (part.startsWith('timbre:')) out.push({ kind: 'timbre', value: parseInt(part.slice(7), 10) });
    else {
      const fx = part.match(/^fx:([0-9A-Fa-f]+),([0-9A-Fa-f]+)$/);
      if (!fx) return null;
      out.push({ kind: 'fx', code: fxNum(fx[1]!), param: fxNum(fx[2]!) });
    }
    last = match.index + part.length;
  }
  if (!/^[\s,]*$/.test(text.slice(last))) return null;
  return out;
}

/**
 * Parse one or more subpattern rows (space- or comma-separated).
 * Returns null when any token is not a SubPatRow atom.
 */
export function parseSubPatternRows(text: string): SubPatternRowLike[] | null {
  const toks = lexSubPatternRows(text);
  if (!toks) return null;
  const rows: SubPatternRowLike[] = [];
  let cur: SubPatternRowLike | null = null;
  const flush = () => {
    if (!cur) return;
    rows.push(cur);
    cur = null;
  };
  for (const tok of toks) {
    if (tok.kind === 'dot') {
      flush();
      rows.push({ empty: true });
      continue;
    }
    if (tok.kind === 'offset') {
      flush();
      cur = { empty: false, offset: tok.value };
      continue;
    }
    if (!cur || cur.empty) cur = { empty: false, offset: null };
    if (tok.kind === 'halt') {
      if (cur.halt) return null;
      cur.halt = true;
    } else if (tok.kind === 'vol') {
      if (cur.vol !== undefined) return null;
      cur.vol = tok.value;
    } else if (tok.kind === 'jump') {
      if (cur.jump !== undefined) return null;
      cur.jump = tok.value;
    } else if (tok.kind === 'timbre') {
      if (cur.timbre !== undefined) return null;
      cur.timbre = tok.value;
    } else if (tok.kind === 'fx') {
      if (cur.fx) return null;
      cur.fx = { code: tok.code, param: tok.param };
    }
  }
  flush();
  return rows;
}

/** One SubPatRow. Null when the text is empty, invalid, or more than one row. */
export function parseSubPatternRow(text: string): SubPatternRowLike | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const rows = parseSubPatternRows(trimmed);
  if (!rows || rows.length !== 1) return null;
  return rows[0]!;
}

export function formatSubPatternRow(row: SubPatternRowLike): string {
  const isBareHalt =
    !!row.halt &&
    !row.empty &&
    (row.offset === undefined || row.offset === null) &&
    row.vol === undefined &&
    !row.fx &&
    row.timbre === undefined &&
    row.jump === undefined;
  if (isBareHalt) return 'halt';

  const parts: string[] = [];
  if (!row.empty && row.offset !== undefined && row.offset !== null) {
    parts.push(signedOffset(row.offset));
  }
  if (row.vol !== undefined) parts.push(`vol:${row.vol}`);
  if (row.timbre !== undefined) parts.push(`timbre:${row.timbre}`);
  if (row.fx) parts.push(`fx:${row.fx.code},${row.fx.param}`);
  if (row.halt) parts.push('halt');
  if (row.jump !== undefined) parts.push(`jump:${row.jump}`);
  return parts.length > 0 ? parts.join(' ') : '.';
}

export function formatSubPatternSource(name: string | undefined, rows: SubPatternRowLike[]): string {
  const body = rows.map((row) => `  ${formatSubPatternRow(row)}`).join('\n');
  const header = name?.trim() ? `subpat ${name.trim()} =` : 'subpat =';
  return `${header}\n${body}`;
}

function formatInstPropValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((item) => item === null || typeof item !== 'object')) {
      return `[${value.join(',')}]`;
    }
    return null;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface InstrumentHoverMarkdown {
  title: string;
  propsFence: string;
  subpatFence?: string;
}

/** Props line plus an optional formatted `subpat` table (never dumps `subpatRows`). */
export function buildInstrumentHoverMarkdown(
  name: string,
  inst: Record<string, unknown>,
): InstrumentHoverMarkdown {
  const skip = new Set(['__loc', 'loc', 'subpatRows']);
  const props: string[] = [];
  for (const [key, value] of Object.entries(inst)) {
    if (skip.has(key)) continue;
    const formatted = formatInstPropValue(value);
    if (formatted === null) continue;
    props.push(`${key}=${formatted}`);
  }

  const rows = Array.isArray(inst.subpatRows) ? (inst.subpatRows as SubPatternRowLike[]) : [];
  const subpatName = typeof inst.subpat === 'string' ? inst.subpat : undefined;
  const result: InstrumentHoverMarkdown = {
    title: `**Instrument**: \`${name}\``,
    propsFence: '```beatbax\n' + props.join(' ') + '\n```',
  };
  if (rows.length > 0) {
    result.subpatFence = '```beatbax\n' + formatSubPatternSource(subpatName, rows) + '\n```';
  }
  return result;
}

export function buildSubpatternHoverMarkdown(name: string, rows: SubPatternRowLike[]): {
  title: string;
  fence: string;
} {
  return {
    title: `**Subpattern**: \`${name}\``,
    fence: '```beatbax\n' + formatSubPatternSource(name, rows) + '\n```',
  };
}
