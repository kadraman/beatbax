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

/** Collect top-level BeatBax definitions keyed by `kind:name`. */
export function collectBaxDefs(content: string): Map<string, BaxDef> {
  const defs = new Map<string, BaxDef>();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;
    const lineNumber = i + 1;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^pat\s+([A-Za-z_]\w*)\s*=\s*(.*)$/))) {
      defs.set(`pattern:${m[1]}`, { kind: 'pattern', name: m[1], body: normBody(m[2]), line, lineNumber });
    } else if ((m = line.match(/^seq\s+([A-Za-z_]\w*)\s*=\s*(.*)$/))) {
      defs.set(`sequence:${m[1]}`, { kind: 'sequence', name: m[1], body: normBody(m[2]), line, lineNumber });
    } else if ((m = line.match(/^effect\s+([A-Za-z_]\w*)\s*=\s*(.*)$/))) {
      defs.set(`effect:${m[1]}`, { kind: 'effect', name: m[1], body: normBody(m[2]), line, lineNumber });
    } else if ((m = line.match(/^inst\s+([A-Za-z_]\w*)\s+(.*)$/))) {
      defs.set(`instrument:${m[1]}`, { kind: 'instrument', name: m[1], body: normBody(m[2]), line, lineNumber });
    } else if ((m = line.match(/^channel\s+(\d+)\s*=>\s*(.*)$/))) {
      defs.set(`channel:${m[1]}`, { kind: 'channel', name: m[1], body: normBody(m[2]), line, lineNumber });
    }
  }
  return defs;
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
  lines.splice(insertAt, 0, def.line);
  return lines.join('\n');
}

/** Line numbers (in `next`) for definitions that were added or had body changes. */
export function collectSemanticChangeLines(previous: string, next: string): number[] {
  const prevDefs = collectBaxDefs(previous);
  const nextDefs = collectBaxDefs(next);
  const lines = new Set<number>();
  for (const [key, def] of nextDefs) {
    const prev = prevDefs.get(key);
    if (!prev || prev.body !== def.body) lines.add(def.lineNumber);
  }
  return [...lines].sort((a, b) => a - b);
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
