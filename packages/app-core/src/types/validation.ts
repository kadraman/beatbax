/**
 * Shared parse/validation diagnostic shape for the web UI (event bus, stores, Monaco).
 */

/** Peggy "expected … but found …" metadata (mirrors @beatbax/engine ParseError). */
export type PeggyExpectedToken = {
  type?: string;
  text?: string;
  description?: string;
};

export interface ValidationLoc {
  start?: { line?: number; column?: number };
  end?: { line?: number; column?: number };
}

/** Single validation error or warning from parse / resolve. */
export interface ValidationIssue {
  component: string;
  message: string;
  loc?: ValidationLoc;
  suggestion?: string;
  file?: string;
  /** Set when mapping to Monaco markers (errors vs warnings vs info). */
  level?: 'error' | 'warning' | 'info';
  /** Peggy hard syntax errors — used for quick-fix hints. */
  expected?: PeggyExpectedToken[];
  found?: string | null;
}

/** Map a validation issue to Problems-panel message severity. */
export function validationIssuePanelType(issue: ValidationIssue): 'error' | 'warning' | 'info' {
  if (issue.level === 'info') return 'info';
  if (issue.level === 'error') return 'error';
  return 'warning';
}

/** Issues that increment the Problems warning badge (excludes info hints). */
export function countValidationWarningBadge(issues: ValidationIssue[]): number {
  return issues.filter((issue) => validationIssuePanelType(issue) === 'warning').length;
}

/** Whether a message belongs on the Problems tab (validation info hints included). */
export function isValidationProblemsPanelMessage(
  type: 'error' | 'warning' | 'info' | 'success',
  source?: string,
): boolean {
  return type === 'error' || type === 'warning' || (type === 'info' && source === 'validation');
}
