/**
 * Pretty-print an instrument definition as a single `inst` statement.
 * Used by the Desktop Instrument Editor writeback path.
 */

import type { EnvelopeAST, InstrumentNode, NoiseAST, SweepAST } from '../parser/ast.js';
import { tokenizeInstRhs } from '../parser/inst-rhs.js';
import { formatMacro, parseMacro } from '../util/music.js';

const SKIP_KEYS = new Set(['__loc', 'subpatRows', 'envelope']);

export interface SerializeInstrumentOptions {
  /** Preferred property order (schema field names). `type` is always first. */
  fieldOrder?: string[];
}

function formatEnv(env: string | EnvelopeAST): string {
  if (typeof env === 'string') return env;
  const level = env.level;
  const direction = env.direction ?? 'down';
  const period = (env as EnvelopeAST & { period?: number }).period;
  const format = (env as EnvelopeAST & { format?: string }).format;
  const csv = period !== undefined && period !== 1
    ? `${level},${direction},${period}`
    : `${level},${direction}`;
  if (format && format !== 'gb') return `${format}:${csv}`;
  return csv;
}

function formatSweep(sweep: string | SweepAST): string {
  if (typeof sweep === 'string') return sweep;
  return `${sweep.time},${sweep.direction ?? 'up'},${sweep.shift}`;
}

function formatNoise(noise: string | NoiseAST): string {
  if (typeof noise === 'string') return noise;
  const parts: string[] = [];
  if (noise.clockShift !== undefined) parts.push(String(noise.clockShift));
  if (noise.widthMode !== undefined) parts.push(String(noise.widthMode));
  if (noise.divisor !== undefined) parts.push(String(noise.divisor));
  return parts.join(',');
}

function formatWidth(value: unknown): { key: string; text: string } | null {
  if (typeof value === 'number') return { key: 'width', text: String(value) };
  if (typeof value === 'string') return { key: 'width', text: value };
  if (value && typeof value === 'object' && 'value' in (value as object)) {
    const obj = value as { value: number; format?: string };
    const key = obj.format ? `${obj.format}:width` : 'width';
    return { key, text: String(obj.value) };
  }
  return null;
}

function formatScalar(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // Quote values with whitespace, `#`, or `//` (comment starters in .bax).
    return /[\s#]|\/\//.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const macro = parseMacro(value);
    return macro ? formatMacro(macro) : `[${value.join(',')}]`;
  }
  return JSON.stringify(value);
}

function formatValue(key: string, value: unknown): { key: string; text: string } | null {
  if (key === 'env' && value) {
    const text = formatEnv(value as string | EnvelopeAST);
    return text ? { key, text } : null;
  }
  if (key === 'sweep' && value) {
    const text = formatSweep(value as string | SweepAST);
    return text ? { key, text } : null;
  }
  if (key === 'noise' && value) {
    const text = formatNoise(value as string | NoiseAST);
    return text ? { key, text } : null;
  }
  if (key === 'width') return formatWidth(value);
  if (key === 'vol_env' || key === 'duty_env' || key === 'arp_env' || key === 'pitch_env' || key === 'noise_rate_env') {
    const macro = parseMacro(value);
    if (!macro) return null;
    return { key, text: formatMacro(macro)! };
  }
  if (key === 'wave' && Array.isArray(value)) {
    if (value.length === 0) return null;
    return { key, text: `[${value.join(',')}]` };
  }
  const text = formatScalar(value);
  if (text === null) return null;
  return { key, text };
}

/**
 * Pretty-print a single instrument field for the Desktop Instrument Editor.
 * Returns '' for empty/unsupported values; never `[object Object]`.
 */
export function formatInstrumentFieldValue(key: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const formatted = formatValue(key, value);
  if (formatted) return formatted.text;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

/**
 * Serialize `inst <name> …` without a trailing newline.
 * Pretty-prints envelopes as CSV (`12,down`) rather than JSON objects.
 */
export function serializeInstrument(
  name: string,
  node: InstrumentNode,
  options: SerializeInstrumentOptions = {},
): string {
  const parts = [`inst ${name}`];
  const seen = new Set<string>();
  const order = ['type', ...(options.fieldOrder ?? []), ...Object.keys(node)];
  for (const key of order) {
    if (SKIP_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    const formatted = formatValue(key, node[key]);
    if (!formatted) continue;
    parts.push(`${formatted.key}=${formatted.text}`);
  }
  return parts.join(' ');
}

/**
 * Parse a plugin preset body (with or without `inst <name>`) into field values.
 * Does not run the full song parser; splits `key=value` tokens the same way as `parseInstRhs`.
 */
export function parseInstrumentBody(content: string): InstrumentNode {
  let rest = content.trim();
  rest = rest.replace(/^inst\s+\S+\s+/i, '');
  const node: InstrumentNode = {};
  const tokens = tokenizeInstRhs(rest);
  for (const token of tokens) {
    const eq = token.indexOf('=');
    if (eq < 0) {
      if (token) (node as Record<string, unknown>)[token] = 'true';
      continue;
    }
    let key = token.slice(0, eq);
    let value = token.slice(eq + 1);
    const km = key.match(/^([a-z]+):(.*)$/i);
    if (km) key = km[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      const pipe = inner.lastIndexOf('|');
      if (pipe >= 0) {
        (node as Record<string, unknown>)[key] = value;
      } else if (!inner) {
        // `[]` must stay empty — `''.split(',')` would yield `['']` → `[0]`.
        (node as Record<string, unknown>)[key] = [];
      } else {
        (node as Record<string, unknown>)[key] = inner.split(',').map(s => Number(s.trim()));
      }
    } else {
      (node as Record<string, unknown>)[key] = value;
    }
  }
  return node;
}
