/**
 * Editor subsystem public API
 */

export { createEditor, configureMonaco } from './monaco-setup';
export type { EditorOptions, BeatBaxEditor } from './monaco-setup';

export { registerBeatBaxLanguage } from './beatbax-language';

export { EditorState, DEFAULT_AUTO_SAVE_DELAY_MS } from './editor-state';
export type {
  IEditorState,
  EditorStateOptions,
  CursorPosition,
  EditorSelection,
} from './editor-state';

export {
  createDiagnosticsManager,
  setupDiagnosticsIntegration,
  parseErrorToDiagnostic,
  warningsToDiagnostics,
} from './diagnostics';
export type { Diagnostic, DiagnosticsManager } from './diagnostics';
