/**
 * Context-aware Monaco completions for BeatBax (.bax).
 */

import * as monaco from 'monaco-editor';
import { chipRegistry } from '@beatbax/engine/chips';
import { exporterRegistry } from '../plugins/browser-exporter-registry';
import { documentationForCompletion, withDocumentation } from './completion-docs';
import {
  buildImportPathCompletionItems,
  isImportPathPosition,
} from './import-paths';
import { getChipInstrumentMeta, getInstPropertyCompletions } from './instrument-meta';

const SNIPPET_RULE = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

/** Built-in inline effect names (engine registry + chip overrides). */
export const BUILTIN_INLINE_EFFECTS = [
  'vib', 'port', 'arp', 'volSlide', 'trem', 'pan', 'echo', 'retrig', 'sweep', 'cut', 'bend', 'pitch_env',
] as const;

/** Sequence transform names (after `:` on a pattern token in a seq). */
export const SEQUENCE_TRANSFORMS = [
  'oct', 'rot', 'rotate', 'rev', 'pal', 'palindrome', 'slow', 'fast', 'transpose', 'semitone', 'st', 'trans',
  'arp', 'clamp', 'fold', 'mute', 'rest', 'inst', 'pan',
] as const;

export type CompletionContextKind =
  | 'blocked'
  | 'channel-sequence'
  | 'channel-instrument'
  | 'sequence-body'
  | 'sequence-modifier'
  | 'modifier-inst-arg'
  | 'pattern-body'
  | 'effect-rhs'
  | 'inline-effect'
  | 'chip-value'
  | 'export-format'
  | 'import-path'
  | 'inst-property'
  | 'top-level';

export interface SongSymbols {
  instruments: string[];
  patterns: string[];
  sequences: string[];
  namedEffects: string[];
}

export interface CompletionContext {
  kind: CompletionContextKind;
  /** True when the user already typed `<` and we should not insert another. */
  insideAngle: boolean;
  /** Set when kind is `inst-property`. */
  instProperty?: string;
}

interface QuoteScanState {
  inDouble: boolean;
  inTriple: boolean;
}

function scanQuoteState(text: string, initial: QuoteScanState): QuoteScanState {
  let i = 0;
  let inDouble = initial.inDouble;
  let inTriple = initial.inTriple;
  while (i < text.length) {
    if (!inDouble && text.substring(i, i + 3) === '"""') {
      inTriple = !inTriple;
      i += 3;
      continue;
    }
    if (!inTriple && text[i] === '"' && (i === 0 || text[i - 1] !== '\\')) {
      inDouble = !inDouble;
    }
    i += 1;
  }
  return { inDouble, inTriple };
}

/** True when the cursor sits inside a double- or triple-quoted string. */
export function isPositionInString(model: monaco.editor.ITextModel, position: monaco.IPosition): boolean {
  if (typeof model.getLineCount !== 'function') {
    const line = model.getLineContent(position.lineNumber);
    const upToCursor = line.substring(0, Math.max(0, position.column - 1));
    const state = scanQuoteState(upToCursor, { inDouble: false, inTriple: false });
    return state.inDouble || state.inTriple;
  }

  let state: QuoteScanState = { inDouble: false, inTriple: false };
  for (let lineNo = 1; lineNo <= model.getLineCount(); lineNo++) {
    const line = model.getLineContent(lineNo);
    if (lineNo < position.lineNumber) {
      state = scanQuoteState(line, state);
      continue;
    }
    const upToCursor = line.substring(0, Math.max(0, position.column - 1));
    const cursorState = scanQuoteState(upToCursor, state);
    return cursorState.inDouble || cursorState.inTriple;
  }
  return false;
}

/**
 * Determine what kind of completions to offer at the cursor.
 * Exported for unit tests.
 */
export function detectCompletionContext(
  line: string,
  column: number,
  inString: boolean,
): CompletionContext {
  if (isImportPathPosition(line, column)) {
    return { kind: 'import-path', insideAngle: false };
  }

  if (inString) return { kind: 'blocked', insideAngle: false };

  const before = line.slice(0, Math.max(0, column - 1));
  const lastOpen = before.lastIndexOf('<');
  const lastClose = before.lastIndexOf('>');
  if (lastOpen > lastClose) {
    return { kind: 'inline-effect', insideAngle: true };
  }

  if (/^\s*chip\s+/.test(line)) {
    const chipKw = line.search(/\bchip\b/);
    const valueStart = chipKw + 'chip'.length + 1;
    if (column > valueStart) return { kind: 'chip-value', insideAngle: false };
  }

  if (/^\s*export\s+/.test(line)) {
    const exportKw = line.search(/\bexport\b/);
    const valueStart = exportKw + 'export'.length + 1;
    if (column > valueStart) return { kind: 'export-format', insideAngle: false };
  }

  if (/^\s*inst\s+\w+/.test(line)) {
    const propMatch = before.match(
      /\b(type|duty|env|wave|volume|width|noise|gm|note|sweep|vol|env_period|sweep_en|sweep_period|sweep_shift|sweep_dir|sample|vol_env|duty_env|arp_env|pitch_env|noise_rate)\s*=\s*([A-Za-z0-9._+#\-]*)$/,
    );
    if (propMatch) {
      return { kind: 'inst-property', insideAngle: false, instProperty: propMatch[1] };
    }
  }

  if (/^\s*seq\s+\w+\s*=/.test(line)) {
    const eq = line.indexOf('=');
    if (column > eq + 1 && /:inst\s*\([^)]*$/.test(before)) {
      return { kind: 'modifier-inst-arg', insideAngle: false };
    }
  }

  if (/^\s*channel\s+\d+\s*=>/.test(line)) {
    const instIdx = line.search(/\binst\s+/);
    const seqIdx = line.search(/\bseq\s+/);
    if (instIdx >= 0) {
      const instNameStart = instIdx + 'inst '.length;
      if (seqIdx >= 0) {
        const seqNameStart = seqIdx + 'seq '.length;
        if (column > seqNameStart) return { kind: 'channel-sequence', insideAngle: false };
        if (column > instNameStart && column <= seqIdx) return { kind: 'channel-instrument', insideAngle: false };
      } else if (column > instNameStart) {
        return { kind: 'channel-instrument', insideAngle: false };
      }
    }
  }

  if (/^\s*effect\s+\w+\s*=/.test(line)) {
    const eq = line.indexOf('=');
    if (column > eq + 1) return { kind: 'effect-rhs', insideAngle: false };
  }

  if (/^\s*seq\s+\w+\s*=/.test(line)) {
    const eq = line.indexOf('=');
    if (column > eq + 1) {
      if (/:[A-Za-z_][\w]*$/.test(before) || before.endsWith(':')) {
        return { kind: 'sequence-modifier', insideAngle: false };
      }
      return { kind: 'sequence-body', insideAngle: false };
    }
  }

  if (/^\s*pat\s+\w+\s*=/.test(line)) {
    const eq = line.indexOf('=');
    if (column > eq + 1) return { kind: 'pattern-body', insideAngle: false };
  }

  return { kind: 'top-level', insideAngle: false };
}

/** Regex fallback when AST is unavailable (parse errors / first keystroke). */
export function parseSymbolsFromSource(source: string): SongSymbols {
  const instruments: string[] = [];
  const patterns: string[] = [];
  const sequences: string[] = [];
  const namedEffects: string[] = [];
  const lines = source.split('\n');

  for (const line of lines) {
    const def = line.match(/^\s*(pat|seq|inst)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[=\s]/);
    if (def) {
      const name = def[2];
      if (def[1] === 'inst') instruments.push(name);
      else if (def[1] === 'pat') patterns.push(name);
      else sequences.push(name);
    }
    const fx = line.match(/^\s*effect\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (fx) namedEffects.push(fx[1]);
  }

  return { instruments, patterns, sequences, namedEffects };
}

type AstLike = {
  insts?: Record<string, unknown>;
  pats?: Record<string, unknown>;
  seqs?: Record<string, unknown>;
  effects?: Record<string, string>;
} | null;

/** Merge AST + import-resolved AST + song + regex fallback into deduplicated symbol lists. */
export function collectSongSymbols(
  ast: AstLike,
  resolvedAst: AstLike,
  song: AstLike,
  sourceFallback: string,
): SongSymbols {
  const fromAst = {
    instruments: Object.keys(ast?.insts ?? {}),
    patterns: Object.keys(ast?.pats ?? {}),
    sequences: Object.keys(ast?.seqs ?? {}),
    namedEffects: Object.keys(ast?.effects ?? {}),
  };
  const fromResolved = {
    instruments: Object.keys(resolvedAst?.insts ?? {}),
    patterns: Object.keys(resolvedAst?.pats ?? {}),
    sequences: Object.keys(resolvedAst?.seqs ?? {}),
    namedEffects: Object.keys(resolvedAst?.effects ?? {}),
  };
  const fromSong = {
    instruments: Object.keys(song?.insts ?? {}),
    patterns: Object.keys(song?.pats ?? {}),
    sequences: Object.keys(song?.seqs ?? {}),
  };
  const regex = parseSymbolsFromSource(sourceFallback);

  const uniq = (lists: string[][]) => [...new Set(lists.flat())].sort();

  return {
    instruments: uniq([
      fromResolved.instruments,
      fromAst.instruments,
      fromSong.instruments,
      regex.instruments,
    ]),
    patterns: uniq([fromResolved.patterns, fromAst.patterns, fromSong.patterns, regex.patterns]),
    sequences: uniq([fromResolved.sequences, fromAst.sequences, fromSong.sequences, regex.sequences]),
    namedEffects: uniq([fromResolved.namedEffects, fromAst.namedEffects, regex.namedEffects]),
  };
}

function wordRange(model: monaco.editor.ITextModel, position: monaco.IPosition): monaco.IRange {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
}

/** Range for the instrument name inside `:inst(...)`. */
export function instModifierArgRange(
  line: string,
  position: monaco.IPosition,
): monaco.IRange | null {
  const before = line.slice(0, Math.max(0, position.column - 1));
  if (!/:inst\s*\([^)]*$/.test(before)) return null;
  const open = before.lastIndexOf('(');
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: open + 2,
    endColumn: position.column,
  };
}

function chipValueSuggestions(
  range: monaco.IRange,
  chip: string,
): monaco.languages.CompletionItem[] {
  const seen = new Set<string>();
  const items: monaco.languages.CompletionItem[] = [];

  for (const name of chipRegistry.list()) {
    if (seen.has(name)) continue;
    seen.add(name);
    const canonical = chipRegistry.resolve(name);
    const plugin = chipRegistry.get(canonical);
    const meta = plugin?.newSongWizard?.metadata;
    const detail = meta?.chipDisplayName
      ? `${meta.chipDisplayName}${meta.platform ? ` (${meta.platform})` : ''}`
      : `${plugin?.channels ?? '?'} channels`;
    items.push({
      label: name,
      kind: monaco.languages.CompletionItemKind.Enum,
      detail,
      insertText: name,
      range,
      sortText: canonical === chip ? `0${name}` : `1${name}`,
      documentation: documentationForCompletion('chip', chip)
        ? { value: documentationForCompletion('chip', chip)! }
        : undefined,
    });
  }
  return items;
}

function exportFormatSuggestions(
  range: monaco.IRange,
  chip: string,
): monaco.languages.CompletionItem[] {
  return exporterRegistry.list(chip).map((plugin) => ({
    label: plugin.id,
    kind: monaco.languages.CompletionItemKind.Constant,
    detail: plugin.label,
    insertText: `${plugin.id} "song.${plugin.extension.replace(/^\./, '')}"`,
    insertTextRules: SNIPPET_RULE,
    range,
    sortText: '0' + plugin.id,
    documentation: documentationForCompletion('export', chip)
      ? { value: documentationForCompletion('export', chip)! }
      : undefined,
  }));
}

function instPropertySuggestions(
  range: monaco.IRange,
  property: string,
  chip: string,
): monaco.languages.CompletionItem[] {
  const meta = getInstPropertyCompletions(chip, property);
  const chipMeta = getChipInstrumentMeta(chip);

  if (property === 'type') {
    return chipMeta.types.map((t) => ({
      label: t,
      kind: monaco.languages.CompletionItemKind.Enum,
      detail: 'Instrument type',
      insertText: t,
      range,
      sortText: '0' + t,
      documentation: documentationForCompletion(t, chip)
        ? { value: documentationForCompletion(t, chip)! }
        : undefined,
    }));
  }

  if (meta?.values?.length) {
    return meta.values.map((v) => ({
      label: v,
      kind: monaco.languages.CompletionItemKind.Value,
      detail: meta.detail ?? property,
      insertText: v,
      range,
      sortText: '0' + v,
    }));
  }

  // Free-form values (env, wave, …): do not suggest other property names — the
  // replace range covers the value token and would corrupt it (e.g. env=down → wave=).
  return [];
}

function refSuggestions(
  names: string[],
  range: monaco.IRange,
  detail: string,
  sortPrefix: string,
): monaco.languages.CompletionItem[] {
  return names.map((name) => ({
    label: name,
    kind: monaco.languages.CompletionItemKind.Value,
    detail,
    insertText: name,
    range,
    sortText: sortPrefix + name,
  }));
}

const DIRECTIVES = [
  { label: 'chip', detail: 'Set target chip', insertText: 'chip gameboy' },
  { label: 'bpm', detail: 'Set tempo', insertText: 'bpm 120' },
  { label: 'stepsPerBar', detail: 'Set steps per bar', insertText: 'stepsPerBar 4' },
  { label: 'volume', detail: 'Set global volume', insertText: 'volume 0.8' },
  { label: 'title', detail: 'Set song title', insertText: 'title "My Song"' },
  { label: 'artist', detail: 'Set artist name', insertText: 'artist "Artist"' },
];

const DEFINITION_SNIPPETS = [
  { label: 'inst (pulse1)', detail: 'Define pulse1 instrument', insertText: 'inst ${1:name} type=pulse1 duty=50 env=12,down' },
  { label: 'inst (pulse2)', detail: 'Define pulse2 instrument', insertText: 'inst ${1:name} type=pulse2 duty=25 env=10,down' },
  { label: 'inst (wave)', detail: 'Define wave instrument', insertText: 'inst ${1:name} type=wave wave=[0,2,3,5,6,8,9,11,12,11,9,8,6,5,3,2,0,2,3,5,6,8,9,11,12,11,9,8,6,5,3,2]' },
  { label: 'inst (noise)', detail: 'Define noise instrument', insertText: 'inst ${1:name} type=noise env=12,down' },
  { label: 'pat', detail: 'Define pattern', insertText: 'pat ${1:name} = ${2:C4 E4 G4 C5}' },
  { label: 'seq', detail: 'Define sequence', insertText: 'seq ${1:name} = ${2:pattern1 pattern2}' },
  { label: 'effect', detail: 'Define named effect preset', insertText: 'effect ${1:name} = ${2:vib:3,6}' },
  { label: 'channel', detail: 'Define channel mapping', insertText: 'channel ${1:1} => inst ${2:lead} seq ${3:main}' },
  { label: 'import', detail: 'Import instruments from file', insertText: 'import "${1:local:lib/instruments.ins}"' },
];

const COMMANDS = [
  { label: 'play', detail: 'Start playback', insertText: 'play' },
  { label: 'export json', detail: 'Export to JSON', insertText: 'export json "song.json"' },
  { label: 'export midi', detail: 'Export to MIDI', insertText: 'export midi "song.mid"' },
  { label: 'export uge', detail: 'Export to UGE', insertText: 'export uge "song.uge"' },
  { label: 'export wav', detail: 'Export to WAV', insertText: 'export wav "song.wav"' },
  { label: 'export famitracker', detail: 'Export to FamiTracker Binary (.ftm) — NES only', insertText: 'export famitracker "song.ftm"' },
  { label: 'export famitracker-text', detail: 'Export to FamiTracker Text (.txt) — NES only', insertText: 'export famitracker-text "song.txt"' },
];

const MODIFIER_SNIPPETS: Array<{ label: string; insertText: string; detail: string }> = [
  { label: ':oct(+1)', insertText: 'oct(+1)', detail: 'Octave up' },
  { label: ':oct(-1)', insertText: 'oct(-1)', detail: 'Octave down' },
  { label: ':rev', insertText: 'rev', detail: 'Reverse pattern' },
  { label: ':slow', insertText: 'slow', detail: 'Double note duration' },
  { label: ':fast', insertText: 'fast', detail: 'Halve note duration' },
  { label: ':inst(...)', insertText: 'inst(${1:name})', detail: 'Override instrument' },
  { label: ':arp(...)', insertText: 'arp(${1:4},${2:7})', detail: 'Arpeggio offsets' },
  { label: ':clamp(...)', insertText: 'clamp(${1:C3},${2:C6})', detail: 'Clamp pitch range' },
  { label: ':fold(...)', insertText: 'fold(${1:C3},${2:C6})', detail: 'Fold pitch into range' },
  { label: ':transpose(...)', insertText: 'transpose(${1:+2})', detail: 'Transpose semitones' },
  { label: ':rot(...)', insertText: 'rot(${1:1})', detail: 'Rotate tokens left' },
  { label: ':mute', insertText: 'mute', detail: 'Replace notes with rests' },
];

const EFFECT_SNIPPETS: Array<{ label: string; insertText: string; detail: string }> = [
  { label: 'vib', insertText: 'vib:${1:4},${2:6}', detail: 'Vibrato' },
  { label: 'port', insertText: 'port:${1:8}', detail: 'Portamento' },
  { label: 'arp', insertText: 'arp:${1:4},${2:7}', detail: 'Arpeggio' },
  { label: 'volSlide', insertText: 'volSlide:${1:-3}', detail: 'Volume slide' },
  { label: 'trem', insertText: 'trem:${1:8},${2:6}', detail: 'Tremolo' },
  { label: 'pan', insertText: 'pan:${1:L}', detail: 'Pan' },
  { label: 'echo', insertText: 'echo:${1:0.25},${2:40},${3:30}', detail: 'Echo / delay' },
  { label: 'retrig', insertText: 'retrig:${1:2}', detail: 'Retrigger' },
  { label: 'cut', insertText: 'cut:${1:4}', detail: 'Note cut' },
  { label: 'bend', insertText: 'bend:${1:+2}', detail: 'Pitch bend' },
  { label: 'pitch_env', insertText: 'pitch_env:[${1:0},${2:2},${3:0}]', detail: 'Pitch envelope macro' },
  { label: 'sweep', insertText: 'sweep:${1:1}', detail: 'Frequency sweep' },
];

/** Turn a Monaco snippet body into literal text (no ${n:…} tab stops). */
export function effectSnippetToPlain(snippetBody: string): string {
  return snippetBody.replace(/\$\{\d+:([^}]*)\}/g, '$1');
}

/**
 * Replace range for text typed after an unclosed `<` on the current line.
 * Ensures completion replaces partial effect names instead of appending after `C4<`.
 */
export function inlineEffectInsertRange(
  line: string,
  position: monaco.IPosition,
): monaco.IRange {
  const before = line.slice(0, Math.max(0, position.column - 1));
  const openIdx = before.lastIndexOf('<');
  const startColumn = openIdx >= 0 ? openIdx + 2 : position.column;
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn,
    endColumn: position.column,
  };
}

function buildNoteSuggestions(range: monaco.IRange): monaco.languages.CompletionItem[] {
  const notes: monaco.languages.CompletionItem[] = [];
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let octave = 0; octave <= 8; octave++) {
    for (const note of noteNames) {
      const label = `${note}${octave}`;
      notes.push({
        label,
        detail: 'Note',
        insertText: label,
        kind: monaco.languages.CompletionItemKind.Value,
        range,
        sortText: '8' + label,
      });
    }
  }
  return notes;
}

function modifierSuggestions(
  range: monaco.IRange,
  namedEffects: string[],
  chip: string,
): monaco.languages.CompletionItem[] {
  const builtins = MODIFIER_SNIPPETS.map((s) => ({
    label: s.label,
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: s.detail,
    insertText: s.insertText,
    insertTextRules: SNIPPET_RULE,
    range,
    sortText: '0' + s.label,
  }));

  const named = namedEffects.map((name) => ({
    label: `:${name}`,
    kind: monaco.languages.CompletionItemKind.Value,
    detail: 'Named effect preset (sequence transform)',
    insertText: name,
    range,
    sortText: '0fx' + name,
  }));

  const transformNames = SEQUENCE_TRANSFORMS.filter(
    (t) => !MODIFIER_SNIPPETS.some((s) => s.insertText.startsWith(t)),
  ).map((t) => ({
    label: `:${t}`,
    kind: monaco.languages.CompletionItemKind.Function,
    detail: 'Sequence transform',
    insertText: t,
    range,
    sortText: '1' + t,
  }));

  return withDocumentation([...builtins, ...named, ...transformNames], chip);
}

function effectSuggestions(
  range: monaco.IRange,
  namedEffects: string[],
  insideAngle: boolean,
  chip: string,
  replaceRange?: monaco.IRange,
): monaco.languages.CompletionItem[] {
  const chipFx = Object.keys(chipRegistry.get(chip)?.effects ?? {});
  const builtinSet = new Set<string>([...BUILTIN_INLINE_EFFECTS, ...chipFx]);
  const itemRange = insideAngle && replaceRange ? replaceRange : range;

  const snippets = EFFECT_SNIPPETS.filter((s) => builtinSet.has(s.label)).map((s) => {
    if (insideAngle) {
      const plain = effectSnippetToPlain(s.insertText);
      return {
        label: s.label,
        kind: monaco.languages.CompletionItemKind.Function,
        detail: s.detail,
        insertText: `${plain}>`,
        range: itemRange,
        sortText: '0' + s.label,
      };
    }
    return {
      label: s.label,
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: s.detail,
      insertText: `<${s.insertText}>`,
      insertTextRules: SNIPPET_RULE,
      range: itemRange,
      sortText: '0' + s.label,
    };
  });

  const plainBuiltins = [...builtinSet]
    .filter((n) => !EFFECT_SNIPPETS.some((s) => s.label === n))
    .map((name) => ({
      label: name,
      kind: monaco.languages.CompletionItemKind.Function,
      detail: 'Inline effect',
      insertText: insideAngle ? `${name}:>` : `<${name}:>`,
      range: itemRange,
      sortText: '1' + name,
    }));

  const named = namedEffects.map((name) => ({
    label: name,
    kind: monaco.languages.CompletionItemKind.Value,
    detail: 'Named effect preset',
    insertText: insideAngle ? `${name}>` : `<${name}>`,
    range: itemRange,
    sortText: '0n' + name,
  }));

  return withDocumentation([...snippets, ...plainBuiltins, ...named], chip);
}

export interface ProvideCompletionsOptions {
  ast: AstLike;
  /** AST after import resolution (merged instruments). */
  resolvedAst?: AstLike;
  song: AstLike;
  chip: string;
}

export function provideBeatBaxCompletions(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
  options: ProvideCompletionsOptions,
): monaco.languages.ProviderResult<monaco.languages.CompletionList> {
  const line = model.getLineContent(position.lineNumber);
  const inString = isPositionInString(model, position);
  const ctx = detectCompletionContext(line, position.column, inString);
  const range = wordRange(model, position);
  const symbols = collectSongSymbols(
    options.ast,
    options.resolvedAst ?? options.ast,
    options.song,
    model.getValue(),
  );

  const suggestions: monaco.languages.CompletionItem[] = [];

  switch (ctx.kind) {
    case 'blocked':
      return { suggestions: [] };

    case 'import-path':
      return {
        suggestions: buildImportPathCompletionItems(model.getValue(), line, position),
        incomplete: false,
      };

    case 'chip-value':
      suggestions.push(...chipValueSuggestions(range, options.chip));
      break;

    case 'export-format':
      suggestions.push(...exportFormatSuggestions(range, options.chip));
      break;

    case 'inst-property':
      if (ctx.instProperty) {
        suggestions.push(...instPropertySuggestions(range, ctx.instProperty, options.chip));
      }
      break;

    case 'modifier-inst-arg': {
      const instRange = instModifierArgRange(line, position) ?? range;
      suggestions.push(...refSuggestions(symbols.instruments, instRange, 'Instrument', '0'));
      break;
    }

    case 'channel-instrument':
      suggestions.push(...withDocumentation(
        refSuggestions(symbols.instruments, range, 'Instrument', '0'),
        options.chip,
      ));
      break;

    case 'channel-sequence':
      suggestions.push(...withDocumentation(
        refSuggestions(symbols.sequences, range, 'Sequence', '0'),
        options.chip,
      ));
      break;

    case 'sequence-body':
      suggestions.push(...withDocumentation(
        refSuggestions(symbols.patterns, range, 'Pattern', '0'),
        options.chip,
      ));
      break;

    case 'sequence-modifier':
      suggestions.push(...modifierSuggestions(range, symbols.namedEffects, options.chip));
      break;

    case 'pattern-body':
      suggestions.push(...refSuggestions(symbols.patterns, range, 'Pattern', '0'));
      suggestions.push(...refSuggestions(symbols.instruments, range, 'Instrument', '1'));
      suggestions.push(...effectSuggestions(range, symbols.namedEffects, false, options.chip));
      suggestions.push(...buildNoteSuggestions(range));
      break;

    case 'effect-rhs':
      suggestions.push(...effectSuggestions(range, symbols.namedEffects, false, options.chip));
      break;

    case 'inline-effect': {
      const inlineRange = inlineEffectInsertRange(line, position);
      suggestions.push(
        ...effectSuggestions(range, symbols.namedEffects, true, options.chip, inlineRange),
      );
      return { suggestions, incomplete: true };
    }

    case 'top-level':
    default:
      suggestions.push(
        ...withDocumentation(
          DIRECTIVES.map((s) => ({
            ...s,
            kind: monaco.languages.CompletionItemKind.Keyword,
            range,
            sortText: '9' + s.label,
          })),
          options.chip,
        ),
        ...withDocumentation(
          DEFINITION_SNIPPETS.map((s) => ({
            ...s,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertTextRules: SNIPPET_RULE,
            range,
            sortText: '9' + s.label,
          })),
          options.chip,
        ),
        ...withDocumentation(
          COMMANDS.map((s) => ({
            ...s,
            kind: monaco.languages.CompletionItemKind.Function,
            range,
            sortText: '9' + s.label,
          })),
          options.chip,
        ),
      );
      break;
  }

  return { suggestions };
}

/** Trigger characters for the BeatBax completion provider. */
export const COMPLETION_TRIGGER_CHARACTERS = [':', '<', '=', '"', '/'] as const;
