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
  /** Set when mapping to Monaco markers (errors vs warnings). */
  level?: 'error' | 'warning';
  /** Peggy hard syntax errors — used for quick-fix hints. */
  expected?: PeggyExpectedToken[];
  found?: string | null;
}
