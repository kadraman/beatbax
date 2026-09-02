/**
 * Shared command labels, keybindings, preconditions, and context-menu metadata
 * for BeatBax editor actions.
 *
 * Standalone Desktop / Web UI:
 * - High-frequency / context-menu actions use flat action names (`Go to Definition`).
 * - Other F1 actions use a light category (`Export: MIDI`).
 * VS Code can prepend `BeatBax: ` via {@link formatCommandLabel}.
 *
 * @module editor/command-labels
 */

import { KeyCode, KeyMod } from 'monaco-editor';

/** Monaco context-menu group shared by all BeatBax editor actions. */
export const BEATBAX_CONTEXT_MENU_GROUP = '9_beatbax';

export type CommandLabelContext = 'standalone' | 'vscode';

export interface CommandContextMenuConfig {
  /** Sort order within the BeatBax context-menu group (gaps of 10 for easy reordering). */
  order: number;
  /** Optional when-clause override (defaults to the command's top-level precondition). */
  precondition?: string;
}

export interface CommandMeta {
  /** Display label (flat or `Category: Command`; no product prefix). */
  label: string;
  /** Monaco when-clause for palette visibility and keybinding availability. */
  precondition?: string;
  /** Monaco key chords (`KeyMod | KeyCode`). Empty / omitted = no shortcut. */
  keybindings?: number[];
  /** When set, the command appears in the Monaco editor right-click menu. */
  contextMenu?: CommandContextMenuConfig;
}

/** Kept Monaco chords after conflict cleanup (see command-context plan). */
const KB = {
  gotoPatternDef: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyD],
  extractToPattern: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE],
  quickExport: [KeyMod.CtrlCmd | KeyCode.KeyE],
} as const;

/**
 * Registry of all BeatBax command-palette labels and optional context-menu opts.
 * Keys are stable command id suffixes (without the `beatbax.` prefix where applicable)
 * or full dotted ids for nested commands (e.g. midi step entry).
 */
export const COMMAND_REGISTRY = {
  // ── Export ───────────────────────────────────────────────────────────────
  exportJson: { label: 'Export: JSON' },
  exportMidi: { label: 'Export: MIDI' },
  exportUge: { label: 'Export: UGE (hUGETracker)' },
  exportWav: { label: 'Export: WAV' },
  exportFamitracker: { label: 'Export: FamiTracker Text (.txt)' },
  exportToClipboard: { label: 'Export: Clipboard…' },
  quickExport: {
    label: 'Quick Export',
    keybindings: [...KB.quickExport],
    contextMenu: { order: 50 },
  },

  // ── Validate ─────────────────────────────────────────────────────────────
  verifySong: { label: 'Validate: Verify Song' },
  auditSong: { label: 'Validate: Audit Song for Issues' },

  // ── Generate ─────────────────────────────────────────────────────────────
  generateSampleInst: { label: 'Generate: Sample Instruments' },
  generateSamplePat: { label: 'Generate: Sample Pattern' },

  // ── Edit ─────────────────────────────────────────────────────────────────
  insertTransform: {
    label: 'Insert Transform…',
    contextMenu: { order: 70 },
  },
  formatDocument: {
    label: 'Format Document',
    contextMenu: { order: 40 },
  },

  // ── Copilot ──────────────────────────────────────────────────────────────
  addSelectionToCopilot: {
    label: 'Add Selection to Copilot',
    precondition: 'beatbax.copilot && editorHasSelection',
    contextMenu: { order: 0 },
  },

  // ── Play ─────────────────────────────────────────────────────────────────
  /**
   * Demoted: selection audition is unreliable (inst/subpat/raw fallthrough).
   * Hidden from F1 / right-click / shortcuts — CodeLens ▶ Preview + Pattern Grid.
   * Handler remains registered so internal triggers still work if needed.
   */
  playSelection: {
    label: 'Play Selection',
    precondition: 'false',
  },
  playArrangementSlice: {
    label: 'Play Arrangement Slice',
    /** Visible only when Pattern Grid feature is on and the panel is shown. */
    precondition: 'beatbax.patternGrid',
    contextMenu: { order: 35 },
  },
  /**
   * Internal preview actions used by playFromCursor / explicit triggers.
   * Hidden from F1 and right-click — CodeLens ▶ Preview is the discoverable UX.
   * precondition `false` keeps them out of the palette while remaining triggerable.
   */
  previewPattern: {
    label: 'Preview Pattern',
    precondition: 'false',
  },
  previewSeq: {
    label: 'Preview Sequence',
    precondition: 'false',
  },
  playFromCursor: { label: 'Play: From Cursor Position' },

  // ── Arrange ──────────────────────────────────────────────────────────────
  restructurePhasedSections: {
    label: 'Arrange: Restructure Phased Sections into Headers',
    precondition: 'beatbax.arrangementFixable',
  },
  addSectionMarkers: {
    label: 'Arrange: Add Section Header Comments',
    precondition: 'beatbax.arrangementFixable',
  },
  splitMonolithicSections: {
    label: 'Arrange: Split Monolithic Channel Sequences',
    precondition: 'beatbax.arrangementFixable',
  },

  // ── Channel ──────────────────────────────────────────────────────────────
  toggleMuteChannel: { label: 'Channel: Toggle Mute…' },
  soloChannel: { label: 'Channel: Solo…' },
  copyChannelConfig: { label: 'Channel: Copy Configuration' },
  swapChannels: { label: 'Channel: Swap Assignments…' },
  instrumentOverride: {
    label: 'Channel: Instrument Override…',
    precondition: 'beatbax.hasInstIdent',
  },

  // ── Navigate ─────────────────────────────────────────────────────────────
  gotoDefinition: {
    label: 'Go to Definition',
    precondition: 'beatbax.canGotoDefinition',
    contextMenu: { order: 20 },
  },
  gotoPatternDef: {
    label: 'Go to Pattern Definition',
    precondition: 'beatbax.hasPatIdent || beatbax.onPatDefLine',
    keybindings: [...KB.gotoPatternDef],
  },
  gotoSeqDef: {
    label: 'Go to Sequence Definition',
    precondition: 'beatbax.hasSeqIdent || beatbax.onSeqDefLine',
  },
  gotoInstDef: {
    label: 'Go to Instrument Definition',
    precondition: 'beatbax.hasInstIdent',
  },
  findReferences: {
    label: 'Find All References',
    contextMenu: { order: 25, precondition: 'beatbax.hasNamedSymbol' },
  },
  listDefinitions: {
    label: 'List All Definitions…',
    contextMenu: { order: 60 },
  },

  // ── Refactor ─────────────────────────────────────────────────────────────
  duplicatePattern: {
    label: 'Duplicate Pattern',
    precondition: 'beatbax.onPatDefLine',
    contextMenu: { order: 30 },
  },
  duplicateSeq: {
    label: 'Duplicate Sequence',
    precondition: 'beatbax.onSeqDefLine',
    contextMenu: { order: 32 },
  },
  renameDefinition: {
    label: 'Rename Definition…',
    contextMenu: { order: 28, precondition: 'beatbax.hasNamedSymbol' },
  },
  extractToPattern: {
    label: 'Extract to Pattern',
    precondition: 'editorHasSelection',
    keybindings: [...KB.extractToPattern],
    contextMenu: { order: 10 },
  },
  sortDefinitions: { label: 'Refactor: Sort Definitions…' },

  // ── Analyze ──────────────────────────────────────────────────────────────
  showUnused: { label: 'Analyze: Show Unused Definitions' },
  showPatternInfo: {
    label: 'Analyze: Show Pattern Duration',
    precondition: 'beatbax.onPatDefLine',
  },

  // ── Help ─────────────────────────────────────────────────────────────────
  showEffectPresets: { label: 'Help: Effect Presets' },
  showSyntaxHelp: {
    label: 'Syntax Reference…',
    contextMenu: { order: 80 },
  },

  // ── MIDI ─────────────────────────────────────────────────────────────────
  'midiStepEntry.arm': {
    label: 'MIDI: Start Step Entry',
    precondition: 'beatbax.midi',
  },
  'midiStepEntry.disarm': {
    label: 'MIDI: Stop Step Entry',
    precondition: 'beatbax.midi',
  },
  'midiStepEntry.toggle': {
    label: 'MIDI: Toggle Step Entry',
    precondition: 'beatbax.midi',
  },
} as const satisfies Record<string, CommandMeta>;

export type CommandRegistryKey = keyof typeof COMMAND_REGISTRY;

/**
 * Resolve the display label for a registry entry.
 * @param context `standalone` (Desktop/Web) uses the registry label as-is;
 *   `vscode` prefixes with `BeatBax: ` for the shared VS Code palette.
 */
export function formatCommandLabel(
  key: CommandRegistryKey,
  options: { context?: CommandLabelContext } = {},
): string {
  const label = COMMAND_REGISTRY[key].label;
  const context = options.context ?? 'standalone';
  return context === 'vscode' ? `BeatBax: ${label}` : label;
}

/** Stable labels for Copilot / docs that reference arrangement fix commands. */
export const ARRANGEMENT_FIX_LABELS = {
  split_monolithic: formatCommandLabel('splitMonolithicSections'),
  restructure_phased: formatCommandLabel('restructurePhasedSections'),
  add_section_markers: formatCommandLabel('addSectionMarkers'),
} as const;

/** Command registry keys that still have a Monaco keybinding. */
export function keyedCommandKeys(): CommandRegistryKey[] {
  return (Object.keys(COMMAND_REGISTRY) as CommandRegistryKey[]).filter(
    (key) => ((COMMAND_REGISTRY[key] as CommandMeta).keybindings?.length ?? 0) > 0,
  );
}

/** Monaco action fields derived from the registry (label + optional context menu + keys). */
export function commandActionUi(
  key: CommandRegistryKey,
  options: { context?: CommandLabelContext } = {},
): {
  label: string;
  keybindings: number[];
  contextMenuGroupId?: string;
  contextMenuOrder?: number;
  precondition?: string;
} {
  const meta = COMMAND_REGISTRY[key] as CommandMeta;
  const precondition = meta.contextMenu?.precondition ?? meta.precondition;
  const result: {
    label: string;
    keybindings: number[];
    contextMenuGroupId?: string;
    contextMenuOrder?: number;
    precondition?: string;
  } = {
    label: formatCommandLabel(key, options),
    keybindings: meta.keybindings ? [...meta.keybindings] : [],
  };
  if (precondition) {
    result.precondition = precondition;
  }
  if (meta.contextMenu) {
    result.contextMenuGroupId = BEATBAX_CONTEXT_MENU_GROUP;
    result.contextMenuOrder = meta.contextMenu.order;
  }
  return result;
}

/** Command ids that should appear in the editor right-click menu. */
export function contextMenuCommandKeys(): CommandRegistryKey[] {
  return (Object.keys(COMMAND_REGISTRY) as CommandRegistryKey[]).filter(
    (key) => (COMMAND_REGISTRY[key] as CommandMeta).contextMenu != null,
  );
}
