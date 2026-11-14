/**
 * Editor subsystem public API
 */

export { createEditor, configureMonaco, currentBeatBaxEditorTheme } from './monaco-setup.js';
export type { EditorOptions, BeatBaxEditor } from './monaco-setup.js';
export {
  EDITOR_FONT_FAMILY_CHOICES,
  EDITOR_FONT_FAMILY_IDS,
  EDITOR_FONT_SIZE_DEFAULT,
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
  EDITOR_FONT_SIZE_STEP,
  EDITOR_VIEW_DEFAULTS,
  clampEditorFontSize,
  editorFontFamilyStack,
  editorViewMonacoOptions,
  editorWheelZoomModifierActive,
  normalizeEditorCursorStyle,
  normalizeEditorFontFamily,
  normalizeEditorLineNumbers,
  normalizeEditorTabSize,
  normalizeEditorWhitespace,
  platformMonacoFontFamily,
  stepEditorFontSize,
} from './editor-view-options.js';
export type {
  EditorCursorStyle,
  EditorFontFamilyId,
  EditorLineNumbers,
  EditorTabSize,
  EditorViewMonacoOptions,
  EditorViewPreferences,
  EditorWhitespace,
  WheelModifierKeys,
} from './editor-view-options.js';

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
  formatHelpSnippetHtml,
  tokenizeHelpSnippet,
  tokenizeHelpSnippetLine,
} from './help-snippet-highlight.js';
export type { HelpSnippetSpan } from './help-snippet-highlight.js';
export { applyUndoableReplace, minimalTextEdit } from './undoable-replace.js';
export { shouldArmTransportLive } from './editor-change-origin.js';
export type { EditorChangeOrigin } from './editor-change-origin.js';

export {
  fieldApplies,
  listInstrumentEditorSections,
  resolveInstrumentEditorSchema,
  resolvePreviewChannel,
  fallbackInstrumentEditor,
  bundledSamplePrefix,
  listBundledSampleNames,
  listBundledSampleRefs,
  parseInstrumentSampleRef,
  formatInstrumentSampleRef,
  sampleRemainderForSchemeChange,
  INSTRUMENT_SAMPLE_SCHEMES,
} from './instrument-editor-schema.js';
export type { InstrumentEditorSection, InstrumentSampleScheme } from './instrument-editor-schema.js';
export { localSampleRemainder, songDirectory } from './instrument-sample-path.js';
export type { LocalSamplePathResult } from './instrument-sample-path.js';
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
  findInstLineIndex,
  findSubpatLineIndex,
  replaceInstLine,
  insertInstLine,
  deleteInstLine,
  duplicateInstLine,
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
