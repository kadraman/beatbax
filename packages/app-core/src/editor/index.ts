/**
 * Editor subsystem public API
 */

export { createEditor, configureMonaco } from './monaco-setup.js';
export type { EditorOptions, BeatBaxEditor } from './monaco-setup.js';

export { registerBeatBaxLanguage, registerNoteEditCommands, transposeCurrentNote } from './beatbax-language.js';
export { insertHelpSnippetBlock } from './help-snippet-insertion.js';

export { setupBeatDecorations } from './beat-decorations.js';
export {
  createDiagnosticsManager,
  setupDiagnosticsIntegration,
  parseErrorToDiagnostic,
  warningsToDiagnostics,
} from './diagnostics.js';
export type { Diagnostic, DiagnosticsManager } from './diagnostics.js';

export {
  registerBeatBaxCodeActions,
  suggestQuickFixes,
  getQuickFixesForProblem,
  findMarkerForProblem,
  applyQuickFixSuggestion,
  stripDiagnosticComponentPrefix,
  closestAllowedValue,
  rankAllowedValues,
  findTokenRangeOnLine,
  stubDefinitionLine,
  isSymbolDefinedInSource,
  findStubInsertLine,
  buildStubInsertEdit,
  findInstrumentReferenceRange,
  findTopLevelKeywordRange,
  suggestTransformReplacement,
} from './code-actions.js';
export type { QuickFixSuggestion, QuickFixTextEdit } from './code-actions.js';
