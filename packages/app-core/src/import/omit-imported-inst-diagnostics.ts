/**
 * Parser runs before `import` resolution, so channel lines that use imported
 * instruments emit "instrument 'X' is not defined". Drop those once X exists
 * on the resolved AST (same rule as the CLI).
 */
const INST_NOT_DEFINED = /instrument '([^']+)' is not defined/;

export function omitIssuesForImportedInstruments<T extends { message: string }>(
  issues: T[],
  insts: Record<string, unknown> | undefined | null,
): T[] {
  if (!insts) return issues;
  return issues.filter((issue) => {
    const match = issue.message.match(INST_NOT_DEFINED);
    return !match || !Object.prototype.hasOwnProperty.call(insts, match[1]);
  });
}
