/**
 * Diagnostics system for Monaco Editor
 * Converts engine errors/warnings to Monaco markers for inline display
 */

import * as monaco from 'monaco-editor';
import type { ValidationIssue } from '../types/validation.js';
import { eventBus } from '../utils/event-bus.js';
import { encodePeggyHintMarkerCode } from './peggy-marker-code.js';

export interface Diagnostic {
  message: string;
  severity: 'error' | 'warning' | 'info';
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
  /** Peggy syntax error metadata for quick-fix providers. */
  peggyExpected?: Array<{ type?: string; text?: string; description?: string }>;
  peggyFound?: string | null;
}

export interface DiagnosticsManager {
  /** Set diagnostics for the editor */
  setDiagnostics: (diagnostics: Diagnostic[]) => void;
  /** Clear all diagnostics */
  clear: () => void;
  /** Get count of diagnostics by severity */
  getCounts: () => { errors: number; warnings: number; info: number };
}

/**
 * Create a diagnostics manager for a Monaco editor
 */
export function createDiagnosticsManager(
  editor: monaco.editor.IStandaloneCodeEditor
): DiagnosticsManager {
  const model = editor.getModel();
  if (!model) {
    throw new Error('Editor model is null');
  }

  let currentDiagnostics: Diagnostic[] = [];

  return {
    setDiagnostics: (diagnostics: Diagnostic[]) => {
      currentDiagnostics = diagnostics;

      // Convert diagnostics to Monaco markers
      const markers: monaco.editor.IMarkerData[] = diagnostics.map((diag) => ({
        message: diag.message,
        code: encodePeggyHintMarkerCode(diag.peggyExpected, diag.peggyFound),
        severity:
          diag.severity === 'error'
            ? monaco.MarkerSeverity.Error
            : diag.severity === 'warning'
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Info,
        startLineNumber: diag.startLine,
        startColumn: diag.startColumn,
        endLineNumber: diag.endLine ?? diag.startLine,
        endColumn: diag.endColumn ?? diag.startColumn + 1,
      }));

      // Set markers on the model
      monaco.editor.setModelMarkers(model, 'beatbax', markers);

      // Note: We don't emit events here to avoid recursion loops.
      // The caller should emit validation events separately.
    },

    clear: () => {
      currentDiagnostics = [];
      monaco.editor.setModelMarkers(model, 'beatbax', []);
    },

    getCounts: () => {
      const errors = currentDiagnostics.filter((d) => d.severity === 'error').length;
      const warnings = currentDiagnostics.filter((d) => d.severity === 'warning').length;
      const info = currentDiagnostics.filter((d) => d.severity === 'info').length;
      return { errors, warnings, info };
    },
  };
}

/**
 * Convert parse errors to diagnostics format
 *
 * @param error - The parse error from the engine
 * @param sourceCode - Optional source code (kept for compatibility, but error enhancement is now done in the engine)
 */
export function parseErrorToDiagnostic(error: any, sourceCode?: string): Diagnostic {
  // Check if this is a Peggy parser error with location information
  if (error.location && error.location.start) {
    return {
      message: error.message || String(error),
      severity: 'error',
      startLine: error.location.start.line,
      startColumn: error.location.start.column,
      endLine: error.location.end?.line ?? error.location.start.line,
      endColumn: error.location.end?.column ?? error.location.start.column + 1,
    };
  }

  // Fallback for errors without location
  return {
    message: error.message || String(error),
    severity: 'error',
    startLine: 1,
    startColumn: 1,
  };
}

/**
 * Convert validation diagnostics (errors and/or warnings) to Monaco diagnostics format.
 * Items with `level === 'error'` get red squiggles; all others get yellow.
 */
export function warningsToDiagnostics(warnings: ValidationIssue[]): Diagnostic[] {
  return warnings.map((w) => {
    const severity: Diagnostic['severity'] =
      w.level === 'error' ? 'error' : 'warning';
    const base = {
      message: `[${w.component}] ${w.message}`,
      severity,
      peggyExpected: w.expected,
      peggyFound: w.found,
    };
    if (w.loc?.start) {
      const startLine = w.loc.start.line ?? 1;
      return {
        ...base,
        startLine,
        startColumn: w.loc.start.column ?? 1,
        endLine: w.loc.end?.line ?? startLine,
        endColumn: w.loc.end?.column ?? (w.loc.start.column ?? 1) + 1,
      };
    }

    return {
      ...base,
      startLine: 1,
      startColumn: 1,
    };
  });
}

/**
 * Setup diagnostics integration with event bus
 * Listens for parse events and updates diagnostics
 */
export function setupDiagnosticsIntegration(
  diagnosticsManager: DiagnosticsManager
): () => void {
  // Listen for parse errors (hard syntax errors from the parser itself)
  const unsubscribeParseError = eventBus.on('parse:error', ({ error }) => {
    const diagnostic = parseErrorToDiagnostic(error);
    diagnosticsManager.setDiagnostics([diagnostic]);
  });

  // Note: parse:success is intentionally NOT handled here.
  // Marker clearing is done by emitParse() directly — after setting new markers —
  // so that neither the playback-manager's parse:success nor any other emitter
  // accidentally wipes live validation squiggles.

  // Return cleanup function
  return () => {
    unsubscribeParseError();
  };
}
