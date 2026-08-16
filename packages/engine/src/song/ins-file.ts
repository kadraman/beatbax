/**
 * Shared helpers for .ins import files: validation allow-list, subpattern merge,
 * and binding `subpat=` names onto instrument `subpatRows`.
 */

import type { AST, InstMap, SubPatternDef } from '../parser/ast.js';

export type SubPatternMap = Record<string, SubPatternDef>;

export interface ImportBundle {
  insts: InstMap;
  subpatterns: SubPatternMap;
}

export function emptyImportBundle(): ImportBundle {
  return { insts: {}, subpatterns: {} };
}

/** AST keys that may appear on a parsed .ins file (including empty parser defaults). */
export const INS_AST_ALLOWED_KEYS = new Set([
  'insts',
  'imports',
  'pats',
  'seqs',
  'channels',
  'play',
  'chip',
  'chipRegion',
  'bpm',
  'time',
  'stepsPerBar',
  'volume',
  'scale',
  'metadata',
  'effects',
  'patternEvents',
  'sequenceItems',
  'subpatterns',
  'diagnostics',
]);

/** Song-level scalar AST fields that must not appear in .ins files. */
export const INS_AST_DISALLOWED_SCALARS = [
  'chip',
  'chipRegion',
  'bpm',
  'time',
  'stepsPerBar',
  'volume',
  'scale',
] as const;

export function collectDisallowedInsScalars(ast: AST): string[] {
  const disallowed: string[] = [];
  for (const key of INS_AST_DISALLOWED_SCALARS) {
    if (ast[key] !== undefined) disallowed.push(key);
  }
  return disallowed;
}

export function mergeSubpatterns(
  base: SubPatternMap,
  override: SubPatternMap,
  sourcePath: string,
  opts: { strictMode?: boolean; onWarn?: (message: string) => void } = {},
): SubPatternMap {
  const result = { ...base };
  for (const [name, def] of Object.entries(override)) {
    if (result[name] !== undefined) {
      const message = `Subpattern "${name}" from "${sourcePath}" overrides previously defined subpattern`;
      if (opts.strictMode) {
        throw new Error(message);
      }
      opts.onWarn?.(message);
    }
    result[name] = def;
  }
  return result;
}

/** Copy named `subpat` rows onto instruments that reference them. */
export function bindSubpatRows(insts: InstMap, subpatterns: SubPatternMap): void {
  for (const inst of Object.values(insts)) {
    const ref = inst.subpat;
    if (ref === undefined || ref === null || ref === '') continue;
    const name = String(ref).trim();
    if (!name) continue;
    const def = subpatterns[name];
    if (!def) continue;
    inst.subpat = name;
    inst.subpatRows = def.rows.map((r) => ({ ...r }));
  }
}
