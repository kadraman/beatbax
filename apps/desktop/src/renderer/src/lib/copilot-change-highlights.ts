import type * as monaco from 'monaco-editor';
import type { AIChangeDiff } from './line-change-diff';

export interface ChangeDecorationSpec {
  range: monaco.IRange;
  options: Record<string, unknown>;
}

function wholeLineRange(model: monaco.editor.ITextModel, lineNum: number): monaco.IRange {
  return {
    startLineNumber: lineNum,
    startColumn: 1,
    endLineNumber: lineNum,
    endColumn: Math.max(1, model.getLineMaxColumn(lineNum)),
  };
}

/** Sorted unique 1-based line numbers that should be highlighted and navigable. */
export function collectChangeHighlightLines(diff: AIChangeDiff): number[] {
  const lines = new Set<number>();
  for (const lineNum of diff.added) lines.add(lineNum);
  for (const block of diff.modified) {
    for (const lineNum of block.newLines) lines.add(lineNum);
  }
  for (const anchor of diff.removed) lines.add(anchor.line);
  return [...lines].sort((a, b) => a - b);
}

export const MAX_INLINE_CHANGE_HIGHLIGHTS = 20;

export interface ChangeDecorationOptions {
  /** When set, only these 1-based line numbers receive gutter/background highlights. */
  onlyLines?: Set<number>;
}

/** Build Monaco decorations for added/modified/removed AI edit lines. */
export function buildChangeDecorationSpecs(
  model: monaco.editor.ITextModel,
  diff: AIChangeDiff,
  options?: ChangeDecorationOptions,
): ChangeDecorationSpec[] {
  const allow = options?.onlyLines;
  const decorations: ChangeDecorationSpec[] = [];

  const includeLine = (lineNum: number): boolean => {
    if (lineNum < 1 || lineNum > model.getLineCount()) return false;
    return !allow || allow.has(lineNum);
  };

  for (const lineNum of diff.added) {
    if (!includeLine(lineNum)) continue;
    decorations.push({
      range: wholeLineRange(model, lineNum),
      options: {
        isWholeLine: true,
        linesDecorationsClassName: 'bb-changed-line-added',
        overviewRulerColor: '#4ec94e',
        overviewRulerLane: 4,
      },
    });
  }

  for (const block of diff.modified) {
    for (const lineNum of block.newLines) {
      if (!includeLine(lineNum)) continue;
      decorations.push({
        range: wholeLineRange(model, lineNum),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: 'bb-changed-line-modified',
          overviewRulerColor: '#dcdcaa',
          overviewRulerLane: 4,
        },
      });
    }
  }

  for (const anchor of diff.removed) {
    if (!includeLine(anchor.line)) continue;
    decorations.push({
      range: wholeLineRange(model, anchor.line),
      options: {
        isWholeLine: true,
        linesDecorationsClassName: 'bb-changed-line-removed',
        overviewRulerColor: '#f48771',
        overviewRulerLane: 4,
      },
    });
  }

  return decorations;
}

export function revealChangeLine(
  editor: monaco.editor.IStandaloneCodeEditor,
  lineNum: number,
): void {
  editor.revealLineInCenter(lineNum);
  editor.setPosition({ lineNumber: lineNum, column: 1 });
  editor.focus();
}
