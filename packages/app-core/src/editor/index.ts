/**
 * Editor subsystem public API
 */

export { createEditor, configureMonaco } from './monaco-setup.js';
export type { EditorOptions, BeatBaxEditor } from './monaco-setup.js';

export {
  HIDDEN_MONACO_ACTION_IDS,
  filterMonacoActionsForPalette,
  hideIrrelevantMonacoActions,
  isHiddenMonacoActionId,
} from './hide-monaco-actions.js';

export {
  ARRANGEMENT_FIX_LABELS,
  BEATBAX_CONTEXT_MENU_GROUP,
  COMMAND_REGISTRY,
  commandActionUi,
  contextMenuCommandKeys,
  formatCommandLabel,
  keyedCommandKeys,
} from './command-labels.js';
export type {
  CommandContextMenuConfig,
  CommandLabelContext,
  CommandMeta,
  CommandRegistryKey,
} from './command-labels.js';

export {
  BEATBAX_CONTEXT_KEYS,
  computeCommandContextState,
  resolveGotoDefinitionTarget,
  setupCommandContext,
} from './command-context.js';
export type {
  BeatBaxContextKey,
  CommandContextPosition,
  CommandContextState,
  CommandFeatureContext,
  SetupCommandContextOptions,
} from './command-context.js';

export { registerBeatBaxLanguage, registerNoteEditCommands, transposeCurrentNote } from './beatbax-language.js';
export { insertHelpSnippetBlock } from './help-snippet-insertion.js';

export {
  fieldApplies,
  resolveInstrumentEditorSchema,
  resolvePreviewChannel,
  fallbackInstrumentEditor,
} from './instrument-editor-schema.js';
export {
  parseHardwareEnvelope,
  formatHardwareEnvelope,
  parseHardwareSweep,
  formatHardwareSweep,
  simulateGBEnvelope,
  simulateHardwareSweep,
  renderEnvelopeSparkline,
} from './envelope-preview.js';
export type {
  HardwareEnvelopeParams,
  HardwareSweepParams,
  EnvelopeDirection,
  SweepDirection,
} from './envelope-preview.js';
export {
  collectLocalInstNames,
  replaceInstLine,
  insertInstLine,
  deleteInstLine,
  uniqueInstName,
  isValidInstName,
  renameInstrumentInSource,
  instIsReferenced,
  splitTrailingComment,
} from './instrument-editor-writeback.js';

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
