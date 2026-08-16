/**
 * Shared helpers for .ins import files: validation allow-list, subpattern/effect
 * merge, and binding `subpat=` names onto instrument `subpatRows`.
 */

import type { AST, InstMap, SubPatternDef } from '../parser/ast.js';

export type SubPatternMap = Record<string, SubPatternDef>;
export type EffectMap = Record<string, string>;

export interface ImportBundle {
  insts: InstMap;
  subpatterns: SubPatternMap;
  effects: EffectMap;
}

export function emptyImportBundle(): ImportBundle {
  return { insts: {}, subpatterns: {}, effects: {} };
}

export const INS_FILE_ALLOWED_DECLARATIONS = '"inst", "import", "subpat", and "effect"';
export const INS_REMOTE_ALLOWED_DECLARATIONS = '"inst", "subpat", and "effect"';

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

/** AST nodes that must not appear in a parsed .ins library (effects are allowed). */
export function collectDisallowedInsFileNodes(
  ast: AST,
  options: { nestedImportsAllowed: boolean } = { nestedImportsAllowed: true },
): string[] {
  const disallowed: string[] = [];

  if (!options.nestedImportsAllowed && ast.imports && ast.imports.length > 0) {
    disallowed.push('imports (nested imports are not allowed in remote .ins files)');
  }

  if (Object.keys(ast.pats || {}).length > 0) disallowed.push('patterns');
  if (Object.keys(ast.seqs || {}).length > 0) disallowed.push('sequences');
  if ((ast.channels || []).length > 0) disallowed.push('channels');
  if (ast.play !== undefined) disallowed.push('play');

  disallowed.push(...collectDisallowedInsScalars(ast));

  if (ast.metadata !== undefined && Object.keys(ast.metadata).length > 0) {
    disallowed.push('metadata');
  }

  if (ast.patternEvents && Object.keys(ast.patternEvents).length > 0) {
    disallowed.push('patternEvents');
  }
  if (ast.sequenceItems && Object.keys(ast.sequenceItems).length > 0) {
    disallowed.push('sequenceItems');
  }

  for (const key of Object.keys(ast)) {
    if (!INS_AST_ALLOWED_KEYS.has(key) && key !== 'insts' && key !== 'imports') {
      disallowed.push(`unknown property '${key}'`);
    }
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

/** Last-wins merge for named `effect` presets (`effect drift = vib:3,4`). */
export function mergeEffects(
  base: EffectMap,
  override: EffectMap,
  sourcePath: string,
  opts: { strictMode?: boolean; onWarn?: (message: string) => void } = {},
): EffectMap {
  const result = { ...base };
  for (const [name, rhs] of Object.entries(override)) {
    if (result[name] !== undefined) {
      const message = `Effect "${name}" from "${sourcePath}" overrides previously defined effect`;
      if (opts.strictMode) {
        throw new Error(message);
      }
      opts.onWarn?.(message);
    }
    result[name] = rhs;
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
