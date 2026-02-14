/**
 * Editor subsystem public API
 */

export { createEditor, configureMonaco } from './monaco-setup';
export type { EditorOptions, BeatBaxEditor } from './monaco-setup';

export { registerBeatBaxLanguage } from './beatbax-language';

export {
  createDiagnosticsManager,
  setupDiagnosticsIntegration,
  parseErrorToDiagnostic,
  warningsToDiagnostics,
} from './diagnostics';
export type { Diagnostic, DiagnosticsManager } from './diagnostics';
