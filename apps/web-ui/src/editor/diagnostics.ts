/**
 * Diagnostics system for Monaco Editor
 * Converts engine errors/warnings to Monaco markers for inline display
 */

import * as monaco from 'monaco-editor';
import { eventBus } from '../utils/event-bus';

export interface Diagnostic {
  message: string;
  severity: 'error' | 'warning' | 'info';
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
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
 */
export function parseErrorToDiagnostic(error: any): Diagnostic {
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
 * Convert validation warnings to diagnostics format
 */
export function warningsToDiagnostics(
  warnings: Array<{ component: string; message: string; loc?: any }>
): Diagnostic[] {
  return warnings.map((w) => {
    if (w.loc && w.loc.start) {
      return {
        message: `[${w.component}] ${w.message}`,
        severity: 'warning',
        startLine: w.loc.start.line,
        startColumn: w.loc.start.column ?? 1,
        endLine: w.loc.end?.line ?? w.loc.start.line,
        endColumn: w.loc.end?.column ?? (w.loc.start.column ?? 1) + 1,
      };
    }

    // Warning without location
    return {
      message: `[${w.component}] ${w.message}`,
      severity: 'warning',
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
  // Listen for parse errors
  const unsubscribeParseError = eventBus.on('parse:error', ({ error }) => {
    const diagnostic = parseErrorToDiagnostic(error);
    diagnosticsManager.setDiagnostics([diagnostic]);
  });

  // Listen for parse success (clear errors)
  const unsubscribeParseSuccess = eventBus.on('parse:success', () => {
    diagnosticsManager.clear();
  });

  // Note: We don't listen for validation:warnings here because the caller
  // (e.g., main-phase1.ts) calls setDiagnostics directly to avoid recursion.

  // Return cleanup function
  return () => {
    unsubscribeParseError();
    unsubscribeParseSuccess();
  };
}
