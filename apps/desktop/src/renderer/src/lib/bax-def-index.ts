export type BaxDefKind = 'pattern' | 'sequence' | 'instrument' | 'effect' | 'channel';

export interface BaxDef {
  kind: BaxDefKind;
  name: string;
  /** Whitespace-normalised definition body, used to detect real changes. */
  body: string;
  /** Trimmed source line from the file. */
  line: string;
  /** 1-based line number in the source file. */
  lineNumber: number;
}

const DEF_PREFIX: Record<BaxDefKind, string> = {
  pattern: 'pat',
  sequence: 'seq',
  instrument: 'inst',
  effect: 'effect',
  channel: 'channel',
};

function normBody(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function matchDefinitionLine(line: string): { kind: BaxDefKind; name: string; body: string } | null {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^pat\s+([A-Za-z_]\w*)\s*=\s*(.*)$/))) return { kind: 'pattern', name: m[1], body: m[2] };
  if ((m = line.match(/^seq\s+([A-Za-z_]\w*)\s*=\s*(.*)$/))) return { kind: 'sequence', name: m[1], body: m[2] };
  if ((m = line.match(/^effect\s+([A-Za-z_]\w*)\s*=\s*(.*)$/))) return { kind: 'effect', name: m[1], body: m[2] };
  if ((m = line.match(/^inst\s+([A-Za-z_]\w*)\s+(.*)$/))) return { kind: 'instrument', name: m[1], body: m[2] };
  if ((m = line.match(/^channel\s+(\d+)\s*=>\s*(.*)$/))) return { kind: 'channel', name: m[1], body: m[2] };
  return null;
}

/** Collect top-level BeatBax definitions keyed by `kind:name`. */
export function collectBaxDefs(content: string): Map<string, BaxDef> {
  const defs = new Map<string, BaxDef>();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const match = matchDefinitionLine(line);
    if (!match) continue;
    defs.set(`${match.kind}:${match.name}`, {
      kind: match.kind,
      name: match.name,
      body: normBody(match.body),
      line,
      lineNumber: i + 1,
    });
  }
  return defs;
}

export type DuplicateDefinitionKind = Exclude<BaxDefKind, 'channel'>;

export interface DuplicateDefinition {
  kind: DuplicateDefinitionKind;
  keyword: string;
  name: string;
  /** 1-based line numbers of every definition of this name in `next`. */
  lines: number[];
}

function definitionLinesByKey(content: string): Map<string, { kind: DuplicateDefinitionKind; name: string; lines: number[] }> {
  const byKey = new Map<string, { kind: DuplicateDefinitionKind; name: string; lines: number[] }>();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = matchDefinitionLine(lines[i].trim());
    if (!match || match.kind === 'channel') continue;
    const key = `${match.kind}:${match.name}`;
    const entry = byKey.get(key) ?? { kind: match.kind, name: match.name, lines: [] };
    entry.lines.push(i + 1);
    byKey.set(key, entry);
  }
  return byKey;
}

/**
 * `pat` / `seq` / `inst` / `effect` names that `next` defines more than once and
 * more often than `previous` does. Duplicates already present in `previous` do not count.
 */
export function findNewDuplicateDefinitions(previous: string, next: string): DuplicateDefinition[] {
  const before = definitionLinesByKey(previous);
  const duplicates: DuplicateDefinition[] = [];
  for (const [key, entry] of definitionLinesByKey(next)) {
    if (entry.lines.length < 2) continue;
    if (entry.lines.length <= (before.get(key)?.lines.length ?? 0)) continue;
    duplicates.push({ kind: entry.kind, keyword: DEF_PREFIX[entry.kind], name: entry.name, lines: entry.lines });
  }
  return duplicates.sort((a, b) => a.lines[0] - b.lines[0]);
}

/** e.g. "`pat melody_vib` is defined more than once (lines 93 and 104)". */
export function describeDuplicateDefinition(duplicate: DuplicateDefinition): string {
  const lines = duplicate.lines;
  const list = lines.length === 2
    ? `${lines[0]} and ${lines[1]}`
    : `${lines.slice(0, -1).join(', ')} and ${lines[lines.length - 1]}`;
  return `\`${duplicate.keyword} ${duplicate.name}\` is defined more than once (lines ${list})`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceDefinitionLine(content: string, def: BaxDef): string | null {
  const prefix = DEF_PREFIX[def.kind];
  const pattern = def.kind === 'instrument'
    ? new RegExp(`^(\\s*)${prefix}\\s+${escapeRegex(def.name)}\\b.*$`, 'm')
    : def.kind === 'channel'
      ? new RegExp(`^(\\s*)${prefix}\\s+${escapeRegex(def.name)}\\s*=>.*$`, 'm')
      : new RegExp(`^(\\s*)${prefix}\\s+${escapeRegex(def.name)}\\s*=.*$`, 'm');
  if (!pattern.test(content)) return null;
  return content.replace(pattern, (_match, indent: string) => `${indent ?? ''}${def.line}`);
}

export function removeDefinitionLine(content: string, def: BaxDef): string | null {
  const prefix = DEF_PREFIX[def.kind];
  const pattern = def.kind === 'instrument'
    ? new RegExp(`^\\s*${prefix}\\s+${escapeRegex(def.name)}\\b.*(?:\\r?\\n|$)`, 'm')
    : def.kind === 'channel'
      ? new RegExp(`^\\s*${prefix}\\s+${escapeRegex(def.name)}\\s*=>.*(?:\\r?\\n|$)`, 'm')
      : new RegExp(`^\\s*${prefix}\\s+${escapeRegex(def.name)}\\s*=.*(?:\\r?\\n|$)`, 'm');
  if (!pattern.test(content)) return null;
  return content.replace(pattern, '').replace(/\n{3,}/g, '\n\n');
}

export function insertDefinitionLine(content: string, def: BaxDef): string {
  const lines = content.split('\n');
  const prefixRe = def.kind === 'instrument'
    ? /^\s*inst\s+[A-Za-z_]\w*\b/
    : def.kind === 'channel'
      ? /^\s*channel\s+\d+\s*=>/
      : new RegExp(`^\\s*${DEF_PREFIX[def.kind]}\\s+[A-Za-z_]\\w*\\s*=`);
  let insertAt = lines.length;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (prefixRe.test(lines[i])) {
      insertAt = i + 1;
      break;
    }
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*play\b/i.test(lines[i])) {
      insertAt = Math.min(insertAt, i);
      break;
    }
  }
  lines.splice(insertAt, 0, def.line);
  return lines.join('\n');
}

function precedingSubstantiveLine(content: string, lineNumber: number): string {
  const lines = content.split('\n');
  for (let i = lineNumber - 2; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (line) return line;
  }
  return '';
}

function enclosingSectionHeader(content: string, lineNumber: number): string {
  const lines = content.split('\n');
  for (let i = lineNumber - 2; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (!line || !line.startsWith('#')) continue;
    if (/^#\s*=+\s*$/.test(line)) continue;
    return line;
  }
  return '';
}

export function definitionMoved(previous: string, prev: BaxDef, next: string, def: BaxDef): boolean {
  return enclosingSectionHeader(previous, prev.lineNumber)
    !== enclosingSectionHeader(next, def.lineNumber);
}

/** Stable placement key — ignores line numbers shifted by unrelated edits elsewhere. */
export function definitionPlacementSignature(content: string, def: BaxDef): string {
  return `${enclosingSectionHeader(content, def.lineNumber)}\n${precedingSubstantiveLine(content, def.lineNumber)}\n${def.line}`;
}

/** Line numbers (in `next`) for definitions that were added, moved, or had body changes. */
export function collectSemanticChangeLines(previous: string, next: string): number[] {
  const prevDefs = collectBaxDefs(previous);
  const nextDefs = collectBaxDefs(next);
  const lines = new Set<number>();
  for (const [key, def] of nextDefs) {
    const prev = prevDefs.get(key);
    if (!prev || prev.body !== def.body) {
      lines.add(def.lineNumber);
      continue;
    }
    if (definitionMoved(previous, prev, next, def)) {
      lines.add(def.lineNumber);
    }
  }
  return [...lines].sort((a, b) => a - b);
}

const MERGEABLE_LINE_RE = /^(pat|seq|effect|inst|channel)\s/;

/**
 * Non-definition, non-comment lines in `candidate` that `previous` lacks —
 * {@link tryMergeChangedDefinitions} drops these (e.g. a changed `play` line).
 */
export function collectUnmergedLines(previous: string, candidate: string): string[] {
  const known = new Set(previous.split('\n').map(normBody));
  const unmerged = new Set<string>();
  for (const raw of candidate.split('\n')) {
    const line = normBody(raw);
    if (!line || line.startsWith('#') || line.startsWith('//') || MERGEABLE_LINE_RE.test(line) || known.has(line)) continue;
    unmerged.add(line);
  }
  return [...unmerged];
}

/**
 * Merge only changed/new top-level definitions from `candidate` into `previous`,
 * preserving comments, metadata, and unchanged lines verbatim.
 */
export function tryMergeChangedDefinitions(previous: string, candidate: string): string | null {
  const prevDefs = collectBaxDefs(previous);
  const candDefs = collectBaxDefs(candidate);
  let merged = previous;
  let changeCount = 0;

  for (const [key, candDef] of candDefs) {
    const prevDef = prevDefs.get(key);
    if (prevDef && prevDef.body === candDef.body) continue;

    if (prevDef) {
      const next = replaceDefinitionLine(merged, candDef);
      if (next === null) return null;
      merged = next;
      changeCount += 1;
    } else {
      merged = insertDefinitionLine(merged, candDef);
      changeCount += 1;
    }
  }

  return changeCount > 0 ? merged : null;
}
