/**
 * Source writeback for a single `inst` line. Preserves trailing comments.
 */

import type { InstrumentNode } from '@beatbax/engine';
import { serializeInstrument } from '@beatbax/engine';

export function splitTrailingComment(line: string): { code: string; comment: string } {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    if (ch === '#' && depth === 0) {
      return { code: line.slice(0, i).trimEnd(), comment: line.slice(i) };
    }
  }
  return { code: line, comment: '' };
}

export function collectLocalInstNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    const m = line.match(/^\s*inst\s+([A-Za-z0-9_-]+)\b/);
    if (m) names.add(m[1]);
  }
  return names;
}

export function findInstLineIndex(source: string, name: string): number {
  const lines = source.split(/\r?\n/);
  const re = new RegExp(`^\\s*inst\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return lines.findIndex((line) => re.test(line));
}

export function replaceInstLine(
  source: string,
  name: string,
  node: InstrumentNode,
  fieldOrder?: string[],
): { next: string; ok: boolean } {
  const lines = source.split(/\r?\n/);
  const idx = findInstLineIndex(source, name);
  if (idx < 0) return { next: source, ok: false };
  const { comment } = splitTrailingComment(lines[idx]);
  const serialized = serializeInstrument(name, node, { fieldOrder });
  lines[idx] = comment ? `${serialized} ${comment}` : serialized;
  return { next: lines.join('\n'), ok: true };
}

export function insertInstLine(source: string, serialized: string, afterName?: string): string {
  const lines = source.split(/\r?\n/);
  if (afterName) {
    const idx = findInstLineIndex(source, afterName);
    if (idx >= 0) {
      lines.splice(idx + 1, 0, serialized);
      return lines.join('\n');
    }
  }
  let lastInst = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*inst\s+/.test(lines[i])) lastInst = i;
  }
  if (lastInst >= 0) {
    lines.splice(lastInst + 1, 0, serialized);
    return lines.join('\n');
  }
  let chipIdx = lines.findIndex((l) => /^\s*chip\s+/.test(l));
  if (chipIdx < 0) chipIdx = 0;
  lines.splice(chipIdx + 1, 0, serialized);
  return lines.join('\n');
}

export function deleteInstLine(source: string, name: string): string {
  const lines = source.split(/\r?\n/);
  const idx = findInstLineIndex(source, name);
  if (idx < 0) return source;
  lines.splice(idx, 1);
  return lines.join('\n');
}

export function uniqueInstName(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

const INST_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** True when `name` is a valid `inst` identifier. */
export function isValidInstName(name: string): boolean {
  return INST_NAME_RE.test(name);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rename an `inst` definition. When `updateReferences` is true, also rewrites
 * other occurrences of that identifier in the song (channel `inst` clauses,
 * inline `inst(…)`, and bare hit-token uses). Other `inst` definition lines
 * are left unchanged.
 */
export function renameInstrumentInSource(
  source: string,
  oldName: string,
  newName: string,
  options?: { updateReferences?: boolean },
): { next: string; ok: boolean } {
  if (!oldName || !newName || oldName === newName || !isValidInstName(newName)) {
    return { next: source, ok: false };
  }
  const idx = findInstLineIndex(source, oldName);
  if (idx < 0) return { next: source, ok: false };

  const esc = escapeRegExp(oldName);
  const lines = source.split(/\r?\n/);
  lines[idx] = lines[idx].replace(new RegExp(`^(\\s*inst\\s+)${esc}\\b`), `$1${newName}`);

  if (options?.updateReferences) {
    const tokenRe = new RegExp(`\\b${esc}\\b`, 'g');
    for (let i = 0; i < lines.length; i++) {
      if (i === idx) continue;
      if (/^\s*inst\s+/.test(lines[i])) continue;
      lines[i] = lines[i].replace(tokenRe, newName);
    }
  }

  return { next: lines.join('\n'), ok: true };
}

export function instIsReferenced(source: string, name: string): boolean {
  const re = new RegExp(`\\binst(?:\\s+|\\()${escapeRegExp(name)}\\b`);
  const lines = source.split(/\r?\n/);
  for (const line of lines) {
    if (/^\s*inst\s+/.test(line)) continue;
    if (re.test(line)) return true;
  }
  return false;
}
