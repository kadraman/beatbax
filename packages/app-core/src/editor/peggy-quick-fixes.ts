/**
 * Quick fixes for Peggy "Expected … but found …" syntax errors and related recovery messages.
 */

import * as monaco from 'monaco-editor';
import {
  findTokenRangeOnLine,
  rankAllowedValues,
  type QuickFixSuggestion,
} from './code-actions.js';
import type { PeggyParseHint } from './peggy-marker-code.js';
export type { PeggyParseHint } from './peggy-marker-code.js';
export { peggyHintFromMarkerCode } from './peggy-marker-code.js';

function localReplaceFix(
  title: string,
  range: monaco.IRange,
  replacement: string,
  isPreferred = true,
): QuickFixSuggestion {
  return { title, edits: [{ range, text: replacement }], isPreferred };
}

function localEnumFixes(
  label: string,
  bad: string,
  options: string[],
  range: monaco.IRange,
): QuickFixSuggestion[] {
  const ranked = rankAllowedValues(bad, options).slice(0, 5);
  return ranked.map((replacement, i) =>
    localReplaceFix(`${label} '${replacement}'`, range, replacement, i === 0),
  );
}

/** Parse Peggy's canonical syntax error message. */
export function parseExpectedButFoundMessage(
  message: string,
): { expectedPart: string; foundPart: string } | null {
  const m = message.match(/^Expected (.+) but (.+) found\.?$/);
  if (!m) return null;
  return { expectedPart: m[1].trim(), foundPart: m[2].trim() };
}

/** Unescape a Peggy double-quoted literal from an error message. */
export function unquotePeggyLiteral(quoted: string): string {
  const inner = quoted.replace(/^"(.*)"$/, '$1');
  return inner
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"');
}

/** Extract quoted literal tokens from the "Expected …" fragment. */
export function extractQuotedLiteralsFromExpected(expectedPart: string): string[] {
  const literals: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(expectedPart)) !== null) {
    literals.push(unquotePeggyLiteral(`"${match[1]}"`));
  }
  return literals;
}

function markerSpan(marker: monaco.editor.IMarkerData): monaco.IRange {
  return {
    startLineNumber: marker.startLineNumber,
    startColumn: marker.startColumn,
    endLineNumber: marker.endLineNumber,
    endColumn: marker.endColumn,
  };
}

function isOperatorLiteral(s: string): boolean {
  return /^(=>|=|[<>]+)$/.test(s);
}

/**
 * Quick fixes for `Expected X but Y found` (message and/or structured Peggy hint).
 */
export function peggyExpectedFixes(
  model: monaco.editor.ITextModel,
  marker: monaco.editor.IMarkerData,
  message: string,
  hint: PeggyParseHint | null,
): QuickFixSuggestion[] {
  const parsed = parseExpectedButFoundMessage(message);
  const expectedPart = parsed?.expectedPart ?? '';
  const foundPart = parsed?.foundPart ?? '';

  const literalsFromMsg = extractQuotedLiteralsFromExpected(expectedPart);
  const literalsFromHint = hint?.expectedLabels ?? [];
  const literals = [...new Set([...literalsFromMsg, ...literalsFromHint])].filter(
    (s) => s && s !== 'end of input',
  );

  const foundFromMsg =
    foundPart && foundPart !== 'end of input' ? unquotePeggyLiteral(foundPart) : null;
  const foundToken = foundFromMsg ?? hint?.found ?? null;

  const lineNumber = marker.startLineNumber;
  const line = model.getLineContent(lineNumber);
  const hintCol = marker.startColumn;
  const fixes: QuickFixSuggestion[] = [];

  const wantsEnd =
    expectedPart.includes('end of input') ||
    literalsFromHint.includes('end of input');

  if (foundToken && wantsEnd) {
    const range =
      findTokenRangeOnLine(line, lineNumber, foundToken, hintCol) ?? markerSpan(marker);
    fixes.push(localReplaceFix(`Remove unexpected '${foundToken}'`, range, '', true));
    return fixes;
  }

  if (foundToken && literals.length > 0) {
    const range =
      findTokenRangeOnLine(line, lineNumber, foundToken, hintCol) ?? markerSpan(marker);

    if (literals.length === 1 && isOperatorLiteral(literals[0])) {
      fixes.push(
        localReplaceFix(
          `Insert '${literals[0]}'`,
          {
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: range.startColumn,
            endColumn: range.startColumn,
          },
          `${literals[0]} `,
          true,
        ),
      );
      return fixes;
    }

    fixes.push(...localEnumFixes('Replace with', foundToken, literals, range));
    return fixes;
  }

  return fixes;
}

/** Fixes for parser recovery messages (statement-level syntax). */
export function statementRecoveryFixes(
  model: monaco.editor.ITextModel,
  marker: monaco.editor.IMarkerData,
  message: string,
): QuickFixSuggestion[] {
  const lineNumber = marker.startLineNumber;
  const line = model.getLineContent(lineNumber);
  const fixes: QuickFixSuggestion[] = [];

  if (/Channel statement is missing '=>'/.test(message)) {
    const m = line.match(/^(\s*channel\s+\d+)(\s*)(.*)$/i);
    if (m) {
      const afterIdCol = m[1].length + 1;
      const gapEndCol = afterIdCol + m[2].length;
      fixes.push(
        localReplaceFix(
          "Insert '=>'",
          {
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: afterIdCol,
            endColumn: gapEndCol,
          },
          ' => ',
          true,
        ),
      );
    }
    return fixes;
  }

  if (/Instrument statement is incomplete: missing value after '='/.test(message)) {
    const m = line.match(/^(\s*inst\s+\S+\s+type=)\s*$/i);
    if (m) {
      const col = m[1].length + 1;
      fixes.push(
        localReplaceFix(
          'Add type=pulse1',
          {
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: col,
            endColumn: col,
          },
          'pulse1',
          true,
        ),
      );
    } else {
      const eq = line.match(/=\s*$/);
      if (eq && eq.index !== undefined) {
        fixes.push(
          localReplaceFix(
            'Add pulse1',
            {
              startLineNumber: lineNumber,
              endLineNumber: lineNumber,
              startColumn: eq.index + 2,
              endColumn: eq.index + 2,
            },
            'pulse1',
            true,
          ),
        );
      }
    }
    return fixes;
  }

  if (/Pattern statement is incomplete: missing pattern content after '='/.test(message)) {
    const m = line.match(/^(\s*pat\s+\S+\s*=\s*)$/i);
    if (m) {
      const col = m[0].length + 1;
      fixes.push(
        localReplaceFix(
          'Add rest placeholder',
          {
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: col,
            endColumn: col,
          },
          '.',
          true,
        ),
      );
    }
    return fixes;
  }

  if (/Sequence statement is incomplete: missing sequence content after '='/.test(message)) {
    const nameMatch = line.match(/^\s*seq\s+(\S+)\s*=\s*$/i);
    const patName = nameMatch?.[1] ? `${nameMatch[1]}_pat` : 'step';
    const m = line.match(/^(\s*seq\s+\S+\s*=\s*)$/i);
    if (m) {
      const col = m[0].length + 1;
      fixes.push(
        localReplaceFix(
          `Use pattern '${patName}'`,
          {
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: col,
            endColumn: col,
          },
          patName,
          true,
        ),
      );
    }
    return fixes;
  }

  if (/^Invalid statement syntax:/.test(message) && /^\s*pat\s+\S+\s+[^=]/i.test(line)) {
    const m = line.match(/^(\s*pat\s+\S+)(\s+)/i);
    if (m) {
      const insertCol = m[1].length + 1;
      fixes.push(
        localReplaceFix(
          "Insert '='",
          {
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: insertCol,
            endColumn: insertCol,
          },
          ' =',
          true,
        ),
      );
    }
    return fixes;
  }

  return fixes;
}
