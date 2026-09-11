/**
 * Source writeback for a single `inst` line. Preserves trailing comments.
 */

import type { InstrumentNode } from '@beatbax/engine';
import { serializeInstrument } from '@beatbax/engine';

/**
 * Peggy `IdentChar` — `[A-Za-z0-9_\-]`. Word-boundary `\b` is wrong here because
 * `-` is not a JS word char, so names ending in `-` never get a trailing `\b`.
 */
const IDENT_CHAR = 'A-Za-z0-9_-';

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
    // Peggy Identifier; stop at first non-IdentChar (no `\b`).
    const m = line.match(new RegExp(`^\\s*inst\\s+([A-Za-z_][${IDENT_CHAR}]*)`));
    if (m) names.add(m[1]!);
  }
  return names;
}

/** `inst <name>` at line start; name ends at Peggy IdentChar boundary. */
function instDefNameRe(name: string): RegExp {
  return new RegExp(`^\\s*inst\\s+${escapeRegExp(name)}(?![${IDENT_CHAR}])`);
}

/** Whole-token match for an instrument identifier in pattern/channel text. */
function instNameTokenRe(name: string, flags = ''): RegExp {
  const esc = escapeRegExp(name);
  return new RegExp(`(?<![${IDENT_CHAR}])${esc}(?![${IDENT_CHAR}])`, flags);
}

export function findInstLineIndex(source: string, name: string): number {
  const lines = source.split(/\r?\n/);
  const re = instDefNameRe(name);
  return lines.findIndex((line) => re.test(line));
}

/** `subpat <name>` at line start; name ends at Peggy IdentChar boundary. */
function subpatDefNameRe(name: string): RegExp {
  return new RegExp(`^\\s*subpat\\s+${escapeRegExp(name)}(?![${IDENT_CHAR}])`);
}

export function findSubpatLineIndex(source: string, name: string): number {
  if (!name) return -1;
  const lines = source.split(/\r?\n/);
  const re = subpatDefNameRe(name);
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
  const { comment } = splitTrailingComment(lines[idx]!);
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
    if (/^\s*inst\s+/.test(lines[i]!)) lastInst = i;
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

/**
 * Insert a copy of the persisted `inst` definition under a unique name.
 * Uses the source line (not panel draft) so invalid withheld edits are not written.
 */
export function duplicateInstLine(
  source: string,
  name: string,
  existing?: Set<string>,
): { next: string; newName: string; body: string; ok: boolean } {
  const idx = findInstLineIndex(source, name);
  if (idx < 0) return { next: source, newName: name, body: '', ok: false };

  const names = existing ?? collectLocalInstNames(source);
  const lines = source.split(/\r?\n/);
  const { code } = splitTrailingComment(lines[idx]!);
  const newName = uniqueInstName(name, names);
  const nextCode = code.replace(
    new RegExp(`^(\\s*inst\\s+)${escapeRegExp(name)}(?![${IDENT_CHAR}])`),
    `$1${newName}`,
  );
  if (nextCode === code) return { next: source, newName: name, body: '', ok: false };

  const bodyMatch = nextCode.match(/^\s*inst\s+\S+\s+(.*)$/);
  const body = (bodyMatch?.[1] ?? '').trim();
  return {
    next: insertInstLine(source, nextCode.trim(), name),
    newName,
    body,
    ok: true,
  };
}

export function uniqueInstName(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/** Peggy `Identifier` — `[A-Za-z_][A-Za-z0-9_\-]*` (grammar.peggy). */
const INST_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** True when `name` is a valid `inst` identifier (Peggy Identifier). */
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
 * are left unchanged. Trailing / full-line comments are not rewritten.
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

  const lines = source.split(/\r?\n/);
  const { code: defCode, comment: defComment } = splitTrailingComment(lines[idx]!);
  const nextDef = defCode.replace(
    new RegExp(`^(\\s*inst\\s+)${escapeRegExp(oldName)}(?![${IDENT_CHAR}])`),
    `$1${newName}`,
  );
  // Fail closed if the def token did not rewrite (e.g. stale `\b` boundaries).
  if (nextDef === defCode) return { next: source, ok: false };
  lines[idx] = defComment ? `${nextDef} ${defComment}` : nextDef;

  if (options?.updateReferences) {
    const tokenRe = instNameTokenRe(oldName, 'g');
    for (let i = 0; i < lines.length; i++) {
      if (i === idx) continue;
      if (/^\s*inst\s+/.test(lines[i]!)) continue;
      const { code, comment } = splitTrailingComment(lines[i]!);
      if (!code) continue; // full-line comment — leave unchanged
      const nextCode = code.replace(tokenRe, newName);
      lines[i] = comment ? `${nextCode} ${comment}` : nextCode;
    }
  }

  return { next: lines.join('\n'), ok: true };
}

/**
 * True when `name` appears outside `inst` definition lines (channel `inst`
 * clauses, inline `inst(…)`, or bare hit-token uses in pat/subpat bodies).
 * Comment text is ignored.
 */
export function instIsReferenced(source: string, name: string): boolean {
  if (!name) return false;
  const tokenRe = instNameTokenRe(name);
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*inst\s+/.test(line)) continue;
    const { code } = splitTrailingComment(line);
    if (code && tokenRe.test(code)) return true;
  }
  return false;
}
