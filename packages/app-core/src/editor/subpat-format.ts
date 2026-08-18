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
