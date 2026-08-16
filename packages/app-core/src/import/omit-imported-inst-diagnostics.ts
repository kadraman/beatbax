/**
 * Parser runs before `import` resolution, so channel lines that use imported
 * instruments emit "instrument 'X' is not defined" and pattern notes that use
 * imported effect presets emit "effect 'X' is not defined". Drop those once
 * X exists on the resolved AST (same rule as the CLI).
 */
const INST_NOT_DEFINED = /instrument '([^']+)' is not defined/;
const EFFECT_NOT_DEFINED = /effect '([^']+)' is not defined/;

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
    return true;
  });
}
