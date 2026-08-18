/**
 * Parser runs before `import` resolution, so channel lines that use imported
 * instruments emit "instrument 'X' is not defined" and pattern notes that use
 * imported effect presets emit "effect 'X' is not defined". A song-local `inst`
 * with `subpat=kit_table` likewise warns until bind. Drop those once X exists
 * on the resolved AST (same rule as the CLI).
 */
const INST_NOT_DEFINED = /instrument '([^']+)' is not defined/;
const EFFECT_NOT_DEFINED = /effect '([^']+)' is not defined/;
const SUBPAT_UNRESOLVED = /subpat='([^']+)' (?:is not defined|was not resolved)/;

function importedSubpatIsBound(
  insts: Record<string, unknown> | undefined | null,
  name: string,
): boolean {
  if (!insts) return false;
  return Object.values(insts).some((inst) => {
    const rec = inst as { subpat?: unknown; subpatRows?: unknown[] };
    return rec.subpat === name && Array.isArray(rec.subpatRows) && rec.subpatRows.length > 0;
  });
}

export function omitIssuesForImportedInstruments<T extends { message: string }>(
  issues: T[],
  insts: Record<string, unknown> | undefined | null,
  effects?: Record<string, unknown> | undefined | null,
): T[] {
  if (!insts && !effects) return issues;
  return issues.filter((issue) => {
    const instMatch = issue.message.match(INST_NOT_DEFINED);
    if (instMatch && insts && Object.prototype.hasOwnProperty.call(insts, instMatch[1])) {
      return false;
    }
    const effectMatch = issue.message.match(EFFECT_NOT_DEFINED);
    if (effectMatch && effects && Object.prototype.hasOwnProperty.call(effects, effectMatch[1])) {
      return false;
    }
    const subpatMatch = issue.message.match(SUBPAT_UNRESOLVED);
    if (subpatMatch && importedSubpatIsBound(insts, subpatMatch[1])) {
      return false;
    }
    return true;
  });
}
