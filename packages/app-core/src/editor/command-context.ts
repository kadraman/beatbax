/**
 * Cursor / feature-driven Monaco context keys for BeatBax command preconditions.
 *
 * Pure state computation is exported for unit tests; {@link setupCommandContext}
 * pushes values into the editor's scoped context key service.
 *
 * @module editor/command-context
 */

import type * as monaco from 'monaco-editor';
import { parseWithPeggy } from '@beatbax/engine/parser';
import { detectArrangementLayout } from './arrangement-slice.js';
import { getIdentifierAtColumn, isValidBeatBaxIdentifier } from './cursor-ident.js';
import { eventBus } from '../utils/event-bus.js';
import { FeatureFlag } from '../utils/feature-flags.js';

/** BeatBax when-clause keys used by {@link COMMAND_REGISTRY} preconditions. */
export const BEATBAX_CONTEXT_KEYS = {
  hasPatIdent: 'beatbax.hasPatIdent',
  hasSeqIdent: 'beatbax.hasSeqIdent',
  hasInstIdent: 'beatbax.hasInstIdent',
  hasSubpatIdent: 'beatbax.hasSubpatIdent',
  hasNamedSymbol: 'beatbax.hasNamedSymbol',
  canGotoDefinition: 'beatbax.canGotoDefinition',
  onPatDefLine: 'beatbax.onPatDefLine',
  onSeqDefLine: 'beatbax.onSeqDefLine',
  onChannelLine: 'beatbax.onChannelLine',
  hasSelection: 'beatbax.hasSelection',
  patternGrid: 'beatbax.patternGrid',
  copilot: 'beatbax.copilot',
  midi: 'beatbax.midi',
  arrangementFixable: 'beatbax.arrangementFixable',
} as const;

export type BeatBaxContextKey = (typeof BEATBAX_CONTEXT_KEYS)[keyof typeof BEATBAX_CONTEXT_KEYS];

export interface CommandFeatureContext {
  patternGrid?: boolean;
  copilot?: boolean;
  midi?: boolean;
}

export interface CommandContextPosition {
  lineNumber: number;
  column: number;
}

export interface CommandContextState {
  hasPatIdent: boolean;
  hasSeqIdent: boolean;
  hasInstIdent: boolean;
  hasSubpatIdent: boolean;
  hasNamedSymbol: boolean;
  canGotoDefinition: boolean;
  onPatDefLine: boolean;
  onSeqDefLine: boolean;
  onChannelLine: boolean;
  hasSelection: boolean;
  patternGrid: boolean;
  copilot: boolean;
  midi: boolean;
  arrangementFixable: boolean;
}

export type GotoDefinitionKind = 'pat' | 'seq' | 'inst' | 'subpat';

export interface GotoDefinitionTarget {
  kind: GotoDefinitionKind;
  name: string;
}

export interface SetupCommandContextOptions {
  editor: monaco.editor.IStandaloneCodeEditor;
  getSource: () => string;
  getFeatureContext?: () => CommandFeatureContext;
}

interface ContextKeyHandle {
  set(value: boolean): void;
}

interface ContextKeyServiceLike {
  createKey(key: string, defaultValue: boolean): ContextKeyHandle;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectDefs(source: string): {
  pats: Set<string>;
  seqs: Set<string>;
  insts: Set<string>;
  subpats: Set<string>;
} {
  const pats = new Set<string>();
  const seqs = new Set<string>();
  const insts = new Set<string>();
  const subpats = new Set<string>();
  for (const line of source.split('\n')) {
    const m = line.match(/^\s*(pat|seq|inst|subpat)\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (!m) continue;
    if (m[1] === 'pat') pats.add(m[2]);
    else if (m[1] === 'seq') seqs.add(m[2]);
    else if (m[1] === 'inst') insts.add(m[2]);
    else subpats.add(m[2]);
  }
  return { pats, seqs, insts, subpats };
}

function isOnDefinitionLine(line: string, word: string, kind: GotoDefinitionKind): boolean {
  if (kind === 'inst') {
    return new RegExp(`^\\s*inst\\s+${escapeRegex(word)}\\b`).test(line);
  }
  if (kind === 'subpat') {
    return new RegExp(`^\\s*subpat\\s+${escapeRegex(word)}\\b`).test(line);
  }
  return new RegExp(`^\\s*${kind}\\s+${escapeRegex(word)}\\b`).test(line);
}

/**
 * Resolve a pat/seq/inst/subpat reference under the cursor that can be jumped to.
 * Returns null when already on the definition or when no known symbol is under the cursor.
 */
export function resolveGotoDefinitionTarget(
  source: string,
  position: CommandContextPosition,
): GotoDefinitionTarget | null {
  const line = lineContent(source, position.lineNumber);
  const word = getIdentifierAtColumn(line, position.column);
  if (!word || !isValidBeatBaxIdentifier(word)) return null;

  const { pats, seqs, insts, subpats } = collectDefs(source);
  const candidates: Array<{ kind: GotoDefinitionKind; set: Set<string> }> = [
    { kind: 'pat', set: pats },
    { kind: 'seq', set: seqs },
    { kind: 'inst', set: insts },
    { kind: 'subpat', set: subpats },
  ];

  for (const { kind, set } of candidates) {
    if (!set.has(word)) continue;
    if (isOnDefinitionLine(line, word, kind)) return null;
    return { kind, name: word };
  }
  return null;
}

function lineContent(source: string, lineNumber: number): string {
  const lines = source.split('\n');
  return lines[lineNumber - 1] ?? '';
}

function isArrangementFixable(source: string): boolean {
  if (!source.trim()) return false;
  try {
    const { ast } = parseWithPeggy(source.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
    const layout = detectArrangementLayout(source, ast);
    return layout === 'monolithic' || layout === 'phased';
  } catch {
    return false;
  }
}

/**
 * Pure computation of BeatBax command context flags from editor state.
 * Safe to call from unit tests without Monaco.
 */
export function computeCommandContextState(
  source: string,
  position: CommandContextPosition | null,
  hasSelection: boolean,
  features: CommandFeatureContext = {},
): CommandContextState {
  const line = position ? lineContent(source, position.lineNumber) : '';
  const onPatDefLine = /^\s*pat\s+[A-Za-z_][A-Za-z0-9_]*/.test(line);
  const onSeqDefLine = /^\s*seq\s+[A-Za-z_][A-Za-z0-9_]*/.test(line);
  const onChannelLine = /^\s*channel\s+\d+/.test(line);

  let hasPatIdent = false;
  let hasSeqIdent = false;
  let hasInstIdent = false;
  let hasSubpatIdent = false;
  let canGotoDefinition = false;

  if (position) {
    const word = getIdentifierAtColumn(line, position.column);
    if (word && isValidBeatBaxIdentifier(word)) {
      const { pats, seqs, insts, subpats } = collectDefs(source);
      hasPatIdent = pats.has(word);
      hasSeqIdent = seqs.has(word);
      hasInstIdent = insts.has(word);
      hasSubpatIdent = subpats.has(word);
      // Definition-line cursor on the name counts even before full buffer scan quirks
      if (onPatDefLine && new RegExp(`^\\s*pat\\s+${escapeRegex(word)}\\b`).test(line)) {
        hasPatIdent = true;
      }
      if (onSeqDefLine && new RegExp(`^\\s*seq\\s+${escapeRegex(word)}\\b`).test(line)) {
        hasSeqIdent = true;
      }
      if (/^\s*inst\s+/.test(line) && new RegExp(`^\\s*inst\\s+${escapeRegex(word)}\\b`).test(line)) {
        hasInstIdent = true;
      }
      if (/^\s*subpat\s+/.test(line) && new RegExp(`^\\s*subpat\\s+${escapeRegex(word)}\\b`).test(line)) {
        hasSubpatIdent = true;
      }
    }
    canGotoDefinition = resolveGotoDefinitionTarget(source, position) !== null;
  }

  const hasNamedSymbol = hasPatIdent || hasSeqIdent || hasInstIdent || hasSubpatIdent;

  return {
    hasPatIdent,
    hasSeqIdent,
    hasInstIdent,
    hasSubpatIdent,
    hasNamedSymbol,
    canGotoDefinition,
    onPatDefLine,
    onSeqDefLine,
    onChannelLine,
    hasSelection,
    patternGrid: Boolean(features.patternGrid),
    copilot: Boolean(features.copilot),
    midi: Boolean(features.midi),
    arrangementFixable: isArrangementFixable(source),
  };
}

function resolveContextKeyService(
  editor: monaco.editor.IStandaloneCodeEditor,
): ContextKeyServiceLike | null {
  const candidate = (editor as unknown as { _contextKeyService?: ContextKeyServiceLike })._contextKeyService;
  if (candidate && typeof candidate.createKey === 'function') {
    return candidate;
  }
  return null;
}

/**
 * Bind BeatBax context keys to the editor and keep them in sync with cursor /
 * selection / content / feature flags. Returns a disposable.
 */
export function setupCommandContext(options: SetupCommandContextOptions): monaco.IDisposable {
  const { editor, getSource, getFeatureContext } = options;
  const service = resolveContextKeyService(editor);
  const handles = new Map<BeatBaxContextKey, ContextKeyHandle>();

  if (service) {
    for (const key of Object.values(BEATBAX_CONTEXT_KEYS)) {
      handles.set(key, service.createKey(key, false));
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null;

  const apply = (state: CommandContextState): void => {
    const values: Record<BeatBaxContextKey, boolean> = {
      [BEATBAX_CONTEXT_KEYS.hasPatIdent]: state.hasPatIdent,
      [BEATBAX_CONTEXT_KEYS.hasSeqIdent]: state.hasSeqIdent,
      [BEATBAX_CONTEXT_KEYS.hasInstIdent]: state.hasInstIdent,
      [BEATBAX_CONTEXT_KEYS.hasSubpatIdent]: state.hasSubpatIdent,
      [BEATBAX_CONTEXT_KEYS.hasNamedSymbol]: state.hasNamedSymbol,
      [BEATBAX_CONTEXT_KEYS.canGotoDefinition]: state.canGotoDefinition,
      [BEATBAX_CONTEXT_KEYS.onPatDefLine]: state.onPatDefLine,
      [BEATBAX_CONTEXT_KEYS.onSeqDefLine]: state.onSeqDefLine,
      [BEATBAX_CONTEXT_KEYS.onChannelLine]: state.onChannelLine,
      [BEATBAX_CONTEXT_KEYS.hasSelection]: state.hasSelection,
      [BEATBAX_CONTEXT_KEYS.patternGrid]: state.patternGrid,
      [BEATBAX_CONTEXT_KEYS.copilot]: state.copilot,
      [BEATBAX_CONTEXT_KEYS.midi]: state.midi,
      [BEATBAX_CONTEXT_KEYS.arrangementFixable]: state.arrangementFixable,
    };
    for (const [key, value] of Object.entries(values) as Array<[BeatBaxContextKey, boolean]>) {
      handles.get(key)?.set(value);
    }
  };

  const refresh = (): void => {
    const selection = editor.getSelection?.() ?? null;
    let hasSelection = false;
    if (selection) {
      if (typeof (selection as { isEmpty?: () => boolean }).isEmpty === 'function') {
        hasSelection = !(selection as { isEmpty: () => boolean }).isEmpty();
      } else {
        const s = selection as {
          startLineNumber: number;
          startColumn: number;
          endLineNumber: number;
          endColumn: number;
        };
        hasSelection = s.startLineNumber !== s.endLineNumber || s.startColumn !== s.endColumn;
      }
    }
    const features = getFeatureContext?.() ?? {};
    // Fall back to window MIDI controller when host omits midi flag
    const midi = features.midi
      ?? Boolean(typeof window !== 'undefined' && (window as any).__beatbax_midiStepEntry);
    apply(computeCommandContextState(
      getSource(),
      editor.getPosition?.() ?? null,
      hasSelection,
      { ...features, midi },
    ));
  };

  const scheduleRefresh = (): void => {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      refresh();
    }, 50);
  };

  const emptyDisposable: monaco.IDisposable = { dispose() { /* noop */ } };
  const subscribe = (
    event: ((listener: () => void) => monaco.IDisposable) | undefined,
    listener: () => void,
  ): monaco.IDisposable => {
    if (typeof event !== 'function') return emptyDisposable;
    return event.call(editor, listener);
  };

  const disposables: monaco.IDisposable[] = [
    // Cursor moves must update context keys immediately so right-click menus match the click site.
    subscribe(editor.onDidChangeCursorPosition, refresh),
    subscribe(editor.onDidChangeCursorSelection, refresh),
    subscribe(editor.onDidChangeModelContent, scheduleRefresh),
    subscribe(editor.onDidChangeModel, refresh),
  ];

  if (typeof editor.onMouseDown === 'function') {
    disposables.push(editor.onMouseDown((e) => {
      if (e.event.rightButton) {
        refresh();
      }
    }));
  }

  // Feature / panel toggles must update beatbax.patternGrid without waiting for a cursor move.
  disposables.push({
    dispose: eventBus.on('feature-flag:changed', ({ flag }) => {
      if (
        flag === FeatureFlag.PATTERN_GRID
        || flag === FeatureFlag.AI_ASSISTANT
      ) {
        refresh();
      }
    }),
  });
  disposables.push({
    dispose: eventBus.on('panel:toggled', ({ panel }) => {
      if (panel === 'pattern-grid') refresh();
    }),
  });

  refresh();

  return {
    dispose() {
      if (timer != null) clearTimeout(timer);
      for (const d of disposables) d.dispose();
      handles.clear();
    },
  };
}
