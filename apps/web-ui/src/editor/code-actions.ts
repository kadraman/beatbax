/**
 * Monaco quick fixes for BeatBax diagnostics (web-only, message-driven).
 */

import * as monaco from 'monaco-editor';
import { parseSymbolsFromSource, type SongSymbols } from './completion';
import {
  peggyExpectedFixes,
  peggyHintFromMarkerCode,
  statementRecoveryFixes,
} from './peggy-quick-fixes';

/** Strip `[component]` prefix added by warningsToDiagnostics. */
export function stripDiagnosticComponentPrefix(message: string): string {
  return message.replace(/^\[[^\]]+\]\s*/, '');
}

export interface QuickFixTextEdit {
  range: monaco.IRange;
  text: string;
}

export interface QuickFixSuggestion {
  title: string;
  isPreferred?: boolean;
  /** One or more document edits (defaults to a single `edits[0]`). */
  edits: QuickFixTextEdit[];
}

/** Parse comma-separated enum list from diagnostic text. */
function parseEnumList(fragment: string): string[] {
  return fragment
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Rank allowed values by similarity to `invalid` (lower score = closer). */
export function rankAllowedValues(invalid: string, options: string[]): string[] {
  if (options.length === 0) return [];
  const lower = invalid.toLowerCase();
  const exact = options.find((o) => o.toLowerCase() === lower);
  if (exact) return [exact];

  const scored = options.map((opt) => {
    const optLower = opt.toLowerCase();
    let score = levenshtein(lower, optLower);
    if (optLower.startsWith(lower) || lower.startsWith(optLower)) score -= 2;
    if (lower.includes(optLower) || optLower.includes(lower)) score -= 1;
    return { opt, score };
  });
  scored.sort((a, b) => a.score - b.score || a.opt.localeCompare(b.opt));
  return scored.map((s) => s.opt);
}

/** Pick the closest allowed value (case-insensitive; simple edit distance). */
export function closestAllowedValue(invalid: string, options: string[]): string {
  return rankAllowedValues(invalid, options)[0] ?? invalid;
}

const MAX_ENUM_FIXES = 5;

function enumReplacementFixes(
  label: string,
  bad: string,
  options: string[],
  range: monaco.IRange,
): QuickFixSuggestion[] {
  const ranked = rankAllowedValues(bad, options);
  const bestScore = ranked.length
    ? levenshtein(bad.toLowerCase(), ranked[0].toLowerCase())
    : 0;
  const closeMatches = ranked.filter(
    (opt, i) =>
      i === 0 || levenshtein(bad.toLowerCase(), opt.toLowerCase()) <= bestScore + 1,
  );
  // For short allow-lists, show every option so the user can pick (e.g. inst types).
  const candidates = (
    options.length <= 6 ? ranked : closeMatches
  ).slice(0, MAX_ENUM_FIXES);

  return candidates.map((replacement, i) =>
    replaceFix(`${label} '${replacement}'`, range, replacement, i === 0),
  );
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Find `token` on a line, preferring the occurrence nearest `hintColumn`.
 */
export function findTokenRangeOnLine(
  line: string,
  lineNumber: number,
  token: string,
  hintColumn: number,
): monaco.IRange | null {
  if (!token) return null;
  let best: monaco.IRange | null = null;
  let bestDist = Infinity;
  let from = 0;
  while (from <= line.length) {
    const idx = line.indexOf(token, from);
    if (idx === -1) break;
    const startColumn = idx + 1;
    const endColumn = startColumn + token.length;
    const dist = Math.abs(startColumn - hintColumn);
    if (dist < bestDist) {
      bestDist = dist;
      best = {
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        startColumn,
        endColumn,
      };
    }
    from = idx + 1;
  }
  return best;
}

/** `type=foo` or standalone token after `=`. */
function findPropertyValueRange(
  line: string,
  lineNumber: number,
  propName: string,
  badValue: string,
  hintColumn: number,
): monaco.IRange | null {
  const typeEq = new RegExp(`\\b${propName}\\s*=\\s*(${escapeRegex(badValue)})\\b`, 'i');
  const m = line.match(typeEq);
  if (m && m.index !== undefined) {
    const start = m.index + m[0].indexOf(m[1]);
    return {
      startLineNumber: lineNumber,
      endLineNumber: lineNumber,
      startColumn: start + 1,
      endColumn: start + 1 + badValue.length,
    };
  }
  return findTokenRangeOnLine(line, lineNumber, badValue, hintColumn);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TRANSFORM_BASE_NAMES = [
  'oct', 'rot', 'rotate', 'rev', 'pal', 'palindrome', 'slow', 'fast', 'arp',
  'clamp', 'fold', 'mute', 'rest', 'inst', 'pan', 'semitone', 'st', 'trans', 'transpose',
];

/** Suggest full modifier text (e.g. tranpese(+2) → transpose(+2)). */
export function suggestTransformReplacement(raw: string): string | null {
  const parts = raw.match(/^([^(]+)(\(.*\))?$/);
  if (!parts) return null;
  const name = rankAllowedValues(parts[1].trim(), TRANSFORM_BASE_NAMES)[0];
  if (!name || levenshtein(parts[1].toLowerCase(), name.toLowerCase()) > 3) return null;
  return name + (parts[2] ?? '');
}

function findSeqModifierRange(
  line: string,
  lineNumber: number,
  modRaw: string,
  hintColumn: number,
): monaco.IRange | null {
  const withColon = ':' + modRaw;
  const idx = line.indexOf(withColon);
  if (idx >= 0) {
    return {
      startLineNumber: lineNumber,
      endLineNumber: lineNumber,
      startColumn: idx + 2,
      endColumn: idx + 2 + modRaw.length,
    };
  }
  return findTokenRangeOnLine(line, lineNumber, modRaw, hintColumn);
}

function replaceFix(
  title: string,
  range: monaco.IRange,
  replacement: string,
  isPreferred = true,
): QuickFixSuggestion {
  return { title, edits: [{ range, text: replacement }], isPreferred };
}

function insertFix(
  title: string,
  edits: QuickFixTextEdit[],
  isPreferred = true,
): QuickFixSuggestion {
  return { title, edits, isPreferred };
}

type StubKind = 'inst' | 'pat' | 'seq';

/** Line content for a minimal instrument / pattern / sequence definition. */
export function stubDefinitionLine(kind: StubKind, name: string, source?: string): string {
  if (kind === 'inst') {
    const type = defaultInstTypeForSource(source ?? '');
    return `inst ${name} type=${type}`;
  }
  if (kind === 'pat') {
    return `pat ${name} = .`;
  }
  const patName = `${name}_pat`;
  return `pat ${patName} = .\nseq ${name} = ${patName}`;
}

function defaultInstTypeForSource(source: string): string {
  const chipMatch = source.match(/^\s*chip\s+(\S+)/m);
  const chip = chipMatch?.[1]?.toLowerCase() ?? 'gameboy';
  if (chip === 'sms' || chip === 'gg' || chip === 'gamegear') return 'tone';
  if (chip === 'nes') return 'pulse1';
  return 'pulse1';
}

/** Whether `name` is already defined as inst / pat / seq in source. */
export function isSymbolDefinedInSource(
  source: string,
  name: string,
  kind: StubKind,
): boolean {
  const symbols = parseSymbolsFromSource(source);
  if (kind === 'inst') return symbols.instruments.includes(name);
  if (kind === 'pat') return symbols.patterns.includes(name);
  return symbols.sequences.includes(name);
}

/**
 * Where to insert a new top-level definition (line before which the stub is inserted).
 */
export function findStubInsertLine(model: monaco.editor.ITextModel, kind: StubKind): number {
  const lineCount = model.getLineCount();
  let lastInst = 0;
  let lastPat = 0;
  let lastSeq = 0;
  let firstPat = 0;
  let firstSeq = 0;
  let firstChannel = 0;

  for (let i = 1; i <= lineCount; i++) {
    const t = model.getLineContent(i).trim();
    if (/^inst\b/i.test(t)) lastInst = i;
    if (/^pat\b/i.test(t)) {
      if (!firstPat) firstPat = i;
      lastPat = i;
    }
    if (/^seq\b/i.test(t)) {
      if (!firstSeq) firstSeq = i;
      lastSeq = i;
    }
    if (/^channel\b/i.test(t) && !firstChannel) firstChannel = i;
  }

  switch (kind) {
    case 'inst':
      if (lastInst) return lastInst + 1;
      if (firstPat) return firstPat;
      if (firstSeq) return firstSeq;
      if (firstChannel) return firstChannel;
      break;
    case 'pat':
      if (lastPat) return lastPat + 1;
      if (firstSeq) return firstSeq;
      if (firstChannel) return firstChannel;
      if (lastInst) return lastInst + 1;
      break;
    case 'seq':
      if (lastSeq) return lastSeq + 1;
      if (firstChannel) return firstChannel;
      if (lastPat) return lastPat + 1;
      if (lastInst) return lastInst + 1;
      break;
  }
  return lineCount + 1;
}

/** Build a text edit that inserts `text` before `insertLine` (1-based). */
export function buildStubInsertEdit(
  model: monaco.editor.ITextModel,
  insertLine: number,
  text: string,
): QuickFixTextEdit {
  const lineCount = model.getLineCount();
  if (insertLine > lineCount) {
    const lastLine = lineCount > 0 ? lineCount : 1;
    const lastContent = model.getLineContent(lastLine);
    return {
      range: {
        startLineNumber: lastLine,
        startColumn: lastContent.length + 1,
        endLineNumber: lastLine,
        endColumn: lastContent.length + 1,
      },
      text: (lastContent.length > 0 ? '\n' : '') + text + '\n',
    };
  }

  return {
    range: {
      startLineNumber: insertLine,
      startColumn: 1,
      endLineNumber: insertLine,
      endColumn: 1,
    },
    text: text + '\n',
  };
}

function createStubFix(
  model: monaco.editor.ITextModel,
  kind: StubKind,
  name: string,
  title: string,
  isPreferred = true,
): QuickFixSuggestion | null {
  const source = model.getValue();
  if (isSymbolDefinedInSource(source, name, kind)) return null;

  const insertLine = findStubInsertLine(model, kind);
  const stubText = stubDefinitionLine(kind, name, source);
  const edit = buildStubInsertEdit(model, insertLine, stubText);
  return insertFix(title, [edit], isPreferred);
}

/** Range of a top-level directive keyword at the start of a line (`seq`, `pat`, …). */
export function findTopLevelKeywordRange(
  line: string,
  lineNumber: number,
  keyword: string,
): monaco.IRange | null {
  const m = line.match(new RegExp(`^(\\s*)(${escapeRegex(keyword)})\\b`, 'i'));
  if (!m) return null;
  const startColumn = m[1].length + 1;
  return {
    startLineNumber: lineNumber,
    endLineNumber: lineNumber,
    startColumn,
    endColumn: startColumn + m[2].length,
  };
}

function unknownKeywordFixes(
  model: monaco.editor.ITextModel,
  bad: string,
  marker: monaco.editor.IMarkerData,
  options: string[],
  preferred?: string,
): QuickFixSuggestion[] {
  const lineNumber = markerLine(marker);
  const line = model.getLineContent(lineNumber);
  const range =
    findTopLevelKeywordRange(line, lineNumber, bad) ?? markerSpan(marker);

  const fixes: QuickFixSuggestion[] = [];
  if (preferred) {
    fixes.push(replaceFix(`Change '${bad}' to '${preferred}'`, range, preferred));
  }
  if (options.length > 0) {
    const ranked = rankAllowedValues(bad, options.filter((o) => o !== preferred));
    const alts = preferred ? ranked.filter((k) => k !== preferred) : ranked;
    fixes.push(
      ...enumReplacementFixes('Change keyword to', bad, alts.slice(0, preferred ? 4 : 5), range),
    );
  }
  return fixes;
}

/** Range of `inst <name>` on a channel (or similar) line. */
export function findInstrumentReferenceRange(
  line: string,
  lineNumber: number,
  instName: string,
  hintColumn: number,
): monaco.IRange | null {
  const m = line.match(new RegExp(`\\binst\\s+(${escapeRegex(instName)})\\b`, 'i'));
  if (m && m.index !== undefined) {
    const start = m.index + m[0].indexOf(m[1]);
    return {
      startLineNumber: lineNumber,
      endLineNumber: lineNumber,
      startColumn: start + 1,
      endColumn: start + 1 + m[1].length,
    };
  }
  return findTokenRangeOnLine(line, lineNumber, instName, hintColumn);
}

function symbolKindLabel(kind: StubKind): string {
  if (kind === 'inst') return 'Use instrument';
  if (kind === 'pat') return 'Use pattern';
  return 'Use sequence';
}

/** Rank defined inst/pat/seq names by similarity to a bad reference (for quick fixes). */
function rankedExistingSymbols(
  name: string,
  symbols: SongSymbols,
  kinds: StubKind[],
): Array<{ kind: StubKind; name: string }> {
  const pool: Array<{ kind: StubKind; name: string }> = [];
  const lower = name.toLowerCase();
  if (kinds.includes('inst')) {
    for (const n of symbols.instruments) {
      if (n.toLowerCase() !== lower) pool.push({ kind: 'inst', name: n });
    }
  }
  if (kinds.includes('pat')) {
    for (const n of symbols.patterns) {
      if (n.toLowerCase() !== lower) pool.push({ kind: 'pat', name: n });
    }
  }
  if (kinds.includes('seq')) {
    for (const n of symbols.sequences) {
      if (n.toLowerCase() !== lower) pool.push({ kind: 'seq', name: n });
    }
  }
  if (pool.length === 0) return [];
  const rankedNames = rankAllowedValues(name, pool.map((p) => p.name));
  const out: Array<{ kind: StubKind; name: string }> = [];
  for (const matchName of rankedNames) {
    const entry = pool.find((p) => p.name === matchName);
    if (entry) out.push(entry);
    if (out.length >= MAX_ENUM_FIXES) break;
  }
  return out;
}

function referenceRangeForSymbol(
  line: string,
  lineNumber: number,
  name: string,
  hintColumn: number,
  kinds: StubKind[],
): monaco.IRange | null {
  if (kinds.length === 1 && kinds[0] === 'inst') {
    return findInstrumentReferenceRange(line, lineNumber, name, hintColumn);
  }
  const seqM = line.match(new RegExp(`\\bseq\\s+(${escapeRegex(name)})\\b`, 'i'));
  if (seqM && seqM.index !== undefined) {
    const start = seqM.index + seqM[0].indexOf(seqM[1]);
    return {
      startLineNumber: lineNumber,
      endLineNumber: lineNumber,
      startColumn: start + 1,
      endColumn: start + 1 + name.length,
    };
  }
  return findTokenRangeOnLine(line, lineNumber, name, hintColumn);
}

/** Replace an undefined inst/pat/seq reference with similar defined names. */
function useExistingSymbolFixes(
  model: monaco.editor.ITextModel,
  name: string,
  marker: monaco.editor.IMarkerData,
  kinds: StubKind[],
): QuickFixSuggestion[] {
  const lineNumber = markerLine(marker);
  const line = model.getLineContent(lineNumber);
  const hintCol = markerHintColumn(marker);
  const range =
    referenceRangeForSymbol(line, lineNumber, name, hintCol, kinds) ??
    markerSpan(marker);

  const symbols = parseSymbolsFromSource(model.getValue());
  const fixes: QuickFixSuggestion[] = [];
  for (const { kind, name: replacement } of rankedExistingSymbols(name, symbols, kinds)) {
    fixes.push(
      replaceFix(
        `${symbolKindLabel(kind)} '${replacement}'`,
        range,
        replacement,
        fixes.length === 0,
      ),
    );
  }
  return fixes;
}

function undefinedInstrumentFixes(
  model: monaco.editor.ITextModel,
  name: string,
  marker: monaco.editor.IMarkerData,
  kinds: StubKind[] = ['inst'],
): QuickFixSuggestion[] {
  const fixes = useExistingSymbolFixes(model, name, marker, kinds);
  const source = model.getValue();

  if (kinds.includes('inst') && !isSymbolDefinedInSource(source, name, 'inst')) {
    const stub = createStubFix(
      model,
      'inst',
      name,
      `Create instrument '${name}'`,
      fixes.length === 0,
    );
    if (stub) fixes.push(stub);
  }

  return fixes;
}

function undefinedPatternOrSequenceFixes(
  model: monaco.editor.ITextModel,
  name: string,
  marker: monaco.editor.IMarkerData,
): QuickFixSuggestion[] {
  const source = model.getValue();
  const fixes = useExistingSymbolFixes(model, name, marker, ['pat', 'seq']);

  if (!isSymbolDefinedInSource(source, name, 'pat')) {
    const pat = createStubFix(
      model,
      'pat',
      name,
      `Create pattern '${name}'`,
      fixes.length === 0,
    );
    if (pat) fixes.push(pat);
  }

  if (!isSymbolDefinedInSource(source, name, 'seq')) {
    const seq = createStubFix(
      model,
      'seq',
      name,
      `Create sequence '${name}'`,
      false,
    );
    if (seq) fixes.push(seq);
  }

  return fixes;
}

function markerLine(marker: monaco.editor.IMarkerData): number {
  return marker.startLineNumber;
}

function markerHintColumn(marker: monaco.editor.IMarkerData): number {
  return marker.startColumn;
}

/**
 * Build quick-fix suggestions for a single squiggle marker.
 */
export function suggestQuickFixes(
  rawMessage: string,
  model: monaco.editor.ITextModel,
  marker: monaco.editor.IMarkerData,
): QuickFixSuggestion[] {
  const message = stripDiagnosticComponentPrefix(rawMessage);
  const lineNumber = markerLine(marker);
  const line = model.getLineContent(lineNumber);
  const hintCol = markerHintColumn(marker);
  const fixes: QuickFixSuggestion[] = [];

  // Peggy: Expected "seq" but "se" found. (hard syntax error, when grammar throws)
  if (/^Expected .+ but .+ found/.test(message)) {
    const hint = peggyHintFromMarkerCode(marker.code as string | undefined);
    fixes.push(...peggyExpectedFixes(model, marker, message, hint));
    if (fixes.length > 0) return fixes;
  }

  // Parser recovery: channel => missing, pat without =, incomplete statements, etc.
  if (
    /^Invalid statement syntax:/.test(message) ||
    /Channel statement is missing/.test(message) ||
    /statement is incomplete:/.test(message)
  ) {
    fixes.push(...statementRecoveryFixes(model, marker, message));
    if (fixes.length > 0) return fixes;
  }

  // Unknown transform 'tranpese(+2)' on 'lead_core' in sequence 'main'.
  let m = message.match(/^Unknown transform '([^']+)' on '([^']+)'/);
  if (m) {
    const bad = m[1];
    const didYouMean = message.match(/Did you mean '([^']+)'\?/);
    const replacement = didYouMean?.[1] ?? suggestTransformReplacement(bad);
    if (replacement) {
      const range =
        findSeqModifierRange(line, lineNumber, bad, hintCol) ?? markerSpan(marker);
      fixes.push(
        replaceFix(`Change transform to '${replacement}'`, range, replacement),
      );
    }
    return fixes;
  }

  // Unknown keyword 'se'. Did you mean 'seq'?  (parser error recovery)
  m = message.match(/^Unknown keyword '([^']+)'\.\s*Did you mean '([^']+)'\?/);
  if (m) {
    fixes.push(...unknownKeywordFixes(model, m[1], marker, [], m[2]));
    return fixes;
  }

  // Unknown keyword 'x'. Valid keywords: chip, bpm, inst, …
  m = message.match(/^Unknown keyword '([^']+)'\.\s*Valid keywords:\s*(.+?)\.?\s*$/);
  if (m) {
    const options = parseEnumList(m[2]);
    fixes.push(...unknownKeywordFixes(model, m[1], marker, options));
    return fixes;
  }

  // Unknown chip 'x'. Supported chips: a, b, c.
  m = message.match(/^Unknown chip '([^']+)'\.\s*Supported chips:\s*([^.]+)\./);
  if (m) {
    const [, bad, listStr] = m;
    const options = parseEnumList(listStr);
    const range =
      findTokenRangeOnLine(line, lineNumber, bad, hintCol) ??
      markerSpan(marker);
    fixes.push(...enumReplacementFixes('Change chip to', bad, options, range));
    return fixes;
  }

  // Invalid NES region 'x'. Valid values: ntsc, pal.
  m = message.match(/^Invalid \w+ region '([^']+)'\.\s*Valid values:\s*([^.]+)\./);
  if (m) {
    const [, bad, listStr] = m;
    const options = parseEnumList(listStr);
    const range =
      findTokenRangeOnLine(line, lineNumber, bad, hintCol) ?? markerSpan(marker);
    if (bad.toLowerCase() === 'ntcs') {
      fixes.push(replaceFix("Change region to 'ntsc'", range, 'ntsc'));
    } else {
      fixes.push(...enumReplacementFixes('Change region to', bad, options, range));
    }
    return fixes;
  }

  // 'play' has unknown flag 'x'. Valid flags: auto, repeat.
  m = message.match(/^'play' has unknown flag '([^']+)'\.\s*Valid flags:\s*([^.]+)\./);
  if (m) {
    const [, bad, listStr] = m;
    const options = parseEnumList(listStr);
    const range =
      findTokenRangeOnLine(line, lineNumber, bad, hintCol) ?? markerSpan(marker);
    fixes.push(
      ...enumReplacementFixes('Change play flag to', bad, options, range),
    );
    return fixes;
  }

  // Instrument 'n': unknown type 'x'. Valid types: ...
  m = message.match(
    /^Instrument '[^']+': unknown type '([^']+)'\.\s*Valid types:\s*([^.]+)\./,
  );
  if (m) {
    const [, bad, listStr] = m;
    const options = parseEnumList(listStr);
    const range =
      findPropertyValueRange(line, lineNumber, 'type', bad, hintCol) ??
      findTokenRangeOnLine(line, lineNumber, bad, hintCol) ??
      markerSpan(marker);
    fixes.push(...enumReplacementFixes('Change type to', bad, options, range));
    return fixes;
  }

  // Unknown NES/SMS instrument type 'x'. Valid types: ...
  m = message.match(/^Unknown \w+ instrument type '([^']+)'\.\s*Valid types:\s*([^.]+)/);
  if (m) {
    const [, bad, listStr] = m;
    const options = parseEnumList(listStr);
    const range =
      findPropertyValueRange(line, lineNumber, 'type', bad, hintCol) ??
      findTokenRangeOnLine(line, lineNumber, bad, hintCol) ??
      markerSpan(marker);
    fixes.push(...enumReplacementFixes('Change type to', bad, options, range));
    return fixes;
  }

  // field must be one of: a, b. Got 'x'  (chip / instrument validators)
  m = message.match(/must be one of:\s*([^.]+)\.\s*Got '([^']+)'/);
  if (m) {
    const listStr = m[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
    const bad = m[2];
    const options = parseEnumList(listStr);
    const range =
      findTokenRangeOnLine(line, lineNumber, bad, hintCol) ??
      findPropertyValueRange(line, lineNumber, 'duty', bad, hintCol) ??
      markerSpan(marker);
    fixes.push(...enumReplacementFixes('Change to', bad, options, range));
    return fixes;
  }

  // sweep_dir must be 'up' or 'down'
  m = message.match(/^(\w+) must be '([^']+)' or '([^']+)'/);
  if (m) {
    const [, field, a, b] = m;
    const options = [a, b];
    const badMatch = line.match(
      new RegExp(`\\b${escapeRegex(field)}\\s*=\\s*([^\\s#]+)`, 'i'),
    );
    if (badMatch) {
      const bad = badMatch[1];
      const replacement = closestAllowedValue(bad, options);
      const range = findPropertyValueRange(line, lineNumber, field, bad, hintCol);
      if (range) {
        fixes.push(
          replaceFix(`Set ${field} to '${replacement}'`, range, replacement),
        );
        return fixes;
      }
    }
  }

  // Duplicate channel N: ...
  m = message.match(/^Duplicate channel (\d+):/);
  if (m) {
    const deleteRange: monaco.IRange =
      lineNumber < model.getLineCount()
        ? {
            startLineNumber: lineNumber,
            startColumn: 1,
            endLineNumber: lineNumber + 1,
            endColumn: 1,
          }
        : {
            startLineNumber: lineNumber,
            startColumn: 1,
            endLineNumber: lineNumber,
            endColumn: line.length + 1,
          };
    fixes.push({
      title: `Remove duplicate channel ${m[1]} declaration`,
      edits: [{ range: deleteRange, text: '' }],
      isPreferred: true,
    });
    return fixes;
  }

  // Instrument 'n': unknown property 'key'.
  m = message.match(/^Instrument '[^']+': unknown property '([^']+)'/);
  if (m) {
    const prop = m[1];
    const bare = prop.includes(':') ? prop.split(':').pop()! : prop;
    const propRe = new RegExp(
      `\\s+${escapeRegex(bare)}(?:\\s*=\\s*[^\\s#]+)?`,
      'i',
    );
    const pm = line.match(propRe);
    if (pm && pm.index !== undefined) {
      fixes.push({
        title: `Remove unknown property '${prop}'`,
        edits: [
          {
            range: {
              startLineNumber: lineNumber,
              endLineNumber: lineNumber,
              startColumn: pm.index + 1,
              endColumn: pm.index + 1 + pm[0].length,
            },
            text: '',
          },
        ],
        isPreferred: true,
      });
    }
    return fixes;
  }

  // Pattern 'p': unknown token 'x' (inline instrument name in pat body, e.g. `pat drums = kt . kit .`)
  m = message.match(
    /^Pattern '[^']+': unknown token '([^']+)' — not a valid note, rest, or defined name\./,
  );
  if (m) {
    fixes.push(
      ...undefinedInstrumentFixes(model, m[1], marker, ['inst', 'pat', 'seq']),
    );
    return fixes;
  }

  // Channel N: instrument 'x' is not defined.
  m = message.match(/^Channel \d+: instrument '([^']+)' is not defined\./);
  if (m) {
    fixes.push(...undefinedInstrumentFixes(model, m[1], marker, ['inst']));
    return fixes;
  }

  // Channel N: sequence/pattern 'x' is not defined.
  m = message.match(/^Channel \d+: sequence\/pattern '([^']+)' is not defined\./);
  if (m) {
    fixes.push(...undefinedPatternOrSequenceFixes(model, m[1], marker));
    return fixes;
  }

  // Sequence 's': pattern/sequence 'x' is not defined.
  m = message.match(/^Sequence '[^']+': pattern\/sequence '([^']+)' is not defined\./);
  if (m) {
    fixes.push(...undefinedPatternOrSequenceFixes(model, m[1], marker));
    return fixes;
  }

  return fixes;
}

function markerSpan(marker: monaco.editor.IMarkerData): monaco.IRange {
  return {
    startLineNumber: marker.startLineNumber,
    startColumn: marker.startColumn,
    endLineNumber: marker.endLineNumber,
    endColumn: marker.endColumn,
  };
}

/** Match a Problems-panel row to the live Monaco squiggle (for marker.code / ranges). */
export function findMarkerForProblem(
  model: monaco.editor.ITextModel,
  message: string,
  loc?: {
    start?: { line?: number; column?: number };
    end?: { line?: number; column?: number };
  },
): monaco.editor.IMarkerData | null {
  const normalized = stripDiagnosticComponentPrefix(message);
  const line = loc?.start?.line ?? 0;
  const col = loc?.start?.column ?? 1;
  const markers = monaco.editor.getModelMarkers({ resource: model.uri, owner: 'beatbax' });

  if (line > 0) {
    const onLine = markers.filter((m) => m.startLineNumber === line);
    const byMessage = onLine.find(
      (m) => stripDiagnosticComponentPrefix(m.message ?? '') === normalized,
    );
    if (byMessage) return byMessage;

    const byColumn = onLine.find(
      (m) => col >= m.startColumn && col <= (m.endColumn ?? m.startColumn + 1),
    );
    if (byColumn) return byColumn;

    if (onLine.length === 1) return onLine[0];
  }

  return (
    markers.find(
      (m) => stripDiagnosticComponentPrefix(m.message ?? '') === normalized,
    ) ?? null
  );
}

function problemLocToMarker(
  message: string,
  loc: {
    start?: { line?: number; column?: number };
    end?: { line?: number; column?: number };
  },
): monaco.editor.IMarkerData {
  const startLine = loc.start?.line ?? 1;
  const startColumn = loc.start?.column ?? 1;
  return {
    message,
    severity: monaco.MarkerSeverity.Warning,
    startLineNumber: startLine,
    startColumn,
    endLineNumber: loc.end?.line ?? startLine,
    endColumn: loc.end?.column ?? startColumn + 1,
  };
}

/** Quick fixes for a Problems-panel entry (same logic as the editor lightbulb). */
export function getQuickFixesForProblem(
  model: monaco.editor.ITextModel,
  message: string,
  loc?: {
    start?: { line?: number; column?: number };
    end?: { line?: number; column?: number };
  },
): QuickFixSuggestion[] {
  const marker =
    findMarkerForProblem(model, message, loc) ??
    (loc?.start?.line ? problemLocToMarker(message, loc) : null);
  if (!marker) return [];
  return suggestQuickFixes(marker.message ?? message, model, marker);
}

/** Apply a quick-fix edit batch to the editor model. */
export function applyQuickFixSuggestion(
  model: monaco.editor.ITextModel,
  fix: QuickFixSuggestion,
): void {
  if (fix.edits.length === 0) return;
  model.pushEditOperations(
    [],
    fix.edits.map((e) => ({ range: e.range, text: e.text, forceMoveMarkers: true })),
    () => null,
  );
}

function toMonacoCodeAction(
  model: monaco.editor.ITextModel,
  marker: monaco.editor.IMarkerData,
  fix: QuickFixSuggestion,
): monaco.languages.CodeAction {
  return {
    title: fix.title,
    kind: 'quickfix',
    diagnostics: [marker],
    isPreferred: fix.isPreferred,
    edit: {
      edits: fix.edits.map((e) => ({
        resource: model.uri,
        versionId: model.getVersionId(),
        textEdit: {
          range: e.range,
          text: e.text,
        },
      })),
    },
  };
}

/** Register BeatBax quick-fix provider (call once at startup). */
export function registerBeatBaxCodeActions(): void {
  monaco.languages.registerCodeActionProvider('beatbax', {
    provideCodeActions(model, _range, context) {
      const actions: monaco.languages.CodeAction[] = [];
      for (const marker of context.markers) {
        const fixes = suggestQuickFixes(
          marker.message ?? '',
          model,
          marker,
        );
        for (const fix of fixes) {
          actions.push(toMonacoCodeAction(model, marker, fix));
        }
      }
      return { actions, dispose: () => {} };
    },
  });
}
