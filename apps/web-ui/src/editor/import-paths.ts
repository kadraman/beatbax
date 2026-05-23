/**
 * Import path suggestions for `import "…"` directives.
 *
 * BeatBax syntax: `import "local:lib/file.ins"` (not `import * from`).
 * The browser cannot enumerate arbitrary local folders; we suggest known paths
 * and show an explicit "(no files found)" item when nothing matches.
 */

import * as monaco from 'monaco-editor';

const RECENT_FILES_KEY = 'beatbax:menu.recentFiles';

/** Common scheme prefixes for import paths. */
export const IMPORT_SCHEME_PREFIXES = ['local:', 'https://', 'http://', 'github:'] as const;

/** Curated paths (CLI local: imports + documented remote examples). */
export const KNOWN_IMPORT_PATHS = [
  'local:lib/gameboy-common.ins',
  'local:lib/gameboy-drums.ins',
  'local:lib/instruments.ins',
  'local:lib/sounds/drums.ins',
  'local:lib/presets.ins',
  'local:lib/bass/sub.ins',
  'github:kadraman/beatbax-instruments/main/melodic.ins',
  'github:kadraman/beatbax-instruments/main/percussion.ins',
  'github:kadraman/beatbax-instruments/main/chips/gameboy/melodic.ins',
] as const;

/** Paths referenced by `import "…"` lines in the current editor source. */
export function parseImportPathsFromSource(source: string): string[] {
  const paths: string[] = [];
  const re = /^\s*import\s+(?:"([^"]*)"|'([^']*)')/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const path = m[1] ?? m[2];
    if (path) paths.push(path);
  }
  return paths;
}

function loadRecentFilenames(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ filename?: string }>;
    return parsed.map((e) => e.filename).filter((f): f is string => typeof f === 'string' && f.length > 0);
  } catch {
    return [];
  }
}

/** Index of the opening quote on an import line (after the `import` keyword). */
function importOpenQuoteIndex(line: string): number {
  const importIdx = line.search(/\bimport\b/);
  if (importIdx < 0) return -1;
  const afterImport = importIdx + 'import'.length;
  const dbl = line.indexOf('"', afterImport);
  const sgl = line.indexOf("'", afterImport);
  if (dbl < 0) return sgl;
  if (sgl < 0) return dbl;
  return Math.min(dbl, sgl);
}

/** Text typed so far inside the import path quotes. */
export function getImportPathPartial(line: string, column: number): string {
  const openQuote = importOpenQuoteIndex(line);
  if (openQuote < 0) return '';
  const col0 = Math.max(0, column - 1);
  if (col0 <= openQuote) return '';
  const quoteChar = line[openQuote];
  const closeQuote = line.indexOf(quoteChar, openQuote + 1);
  let end = col0 + 1;
  if (closeQuote >= 0) {
    end = Math.min(end, closeQuote);
  } else {
    end = Math.max(end, line.length);
  }
  return line.slice(openQuote + 1, end);
}

/** True when the cursor is inside the quoted import path (supports unclosed quotes). */
export function isImportPathPosition(line: string, column: number): boolean {
  if (!/^\s*import\b/.test(line)) return false;
  const openQuote = importOpenQuoteIndex(line);
  if (openQuote < 0) return false;
  const col0 = column - 1;
  if (col0 <= openQuote) return false;

  const quoteChar = line[openQuote];
  const closeQuote = line.indexOf(quoteChar, openQuote + 1);
  if (closeQuote < 0) return col0 >= openQuote + 1;
  return col0 >= openQuote + 1 && col0 <= closeQuote;
}

export function importPathInsertRange(
  line: string,
  position: { lineNumber: number; column: number },
): monaco.IRange {
  const openQuote = importOpenQuoteIndex(line);
  const quoteChar = openQuote >= 0 ? line[openQuote] : '"';
  const closeQuote = openQuote >= 0 ? line.indexOf(quoteChar, openQuote + 1) : -1;
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: openQuote >= 0 ? openQuote + 2 : position.column,
    endColumn: closeQuote >= 0 ? closeQuote + 1 : position.column,
  };
}

/** All import path candidates before prefix filtering. */
export function collectImportPathCandidates(source: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (p: string) => {
    if (!p || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };

  for (const p of parseImportPathsFromSource(source)) add(p);
  for (const p of KNOWN_IMPORT_PATHS) add(p);
  for (const p of loadRecentFilenames()) {
    if (p.endsWith('.ins')) {
      add(p.startsWith('local:') ? p : `local:${p}`);
    }
  }
  for (const scheme of IMPORT_SCHEME_PREFIXES) add(scheme);

  return out.sort();
}

/** Filter paths that extend the typed prefix (for `local:lib/` style completion). */
export function filterImportPathsByPrefix(paths: string[], prefix: string): string[] {
  if (!prefix) return paths;
  return paths.filter((p) => p.startsWith(prefix) && p.length > prefix.length);
}

export function buildImportPathCompletionItems(
  source: string,
  line: string,
  position: monaco.IPosition,
): monaco.languages.CompletionItem[] {
  const range = importPathInsertRange(line, position);
  const partial = getImportPathPartial(line, position.column);
  const all = collectImportPathCandidates(source);

  let matches = filterImportPathsByPrefix(all, partial);
  if (!partial) {
    matches = all;
  } else if (matches.length === 0) {
    matches = all.filter((p) => p.startsWith(partial));
  }

  if (matches.length === 0) {
    return [{
      label: '(no files found)',
      kind: monaco.languages.CompletionItemKind.Text,
      detail: partial.startsWith('local:')
        ? 'Browser cannot list local folders — use a known path or run the CLI'
        : 'No matching import paths',
      insertText: partial,
      filterText: partial || '(no files found)',
      range,
      sortText: 'z',
    }];
  }

  return matches.map((path) => ({
    label: path,
    kind: monaco.languages.CompletionItemKind.File,
    detail: path.startsWith('local:') ? 'Local import (CLI)' : 'Import path',
    insertText: path,
    filterText: path,
    range,
    sortText: '0' + path,
  }));
}

/** @deprecated Use collectImportPathCandidates */
export function collectImportPathSuggestions(source: string): string[] {
  return collectImportPathCandidates(source);
}
