import type * as monaco from 'monaco-editor';
import type { CopilotEditChange, CopilotEditChangeAction } from './copilot-edit-changes';
import type { ChangeDecorationSpec } from './copilot-change-highlights';

function wholeLineRange(model: monaco.editor.ITextModel, lineNum: number): monaco.IRange {
  return {
    startLineNumber: lineNum,
    startColumn: 1,
    endLineNumber: lineNum,
    endColumn: Math.max(1, model.getLineMaxColumn(lineNum)),
  };
}

const CLASS_BY_ACTION: Record<CopilotEditChangeAction, string> = {
  added: 'bb-changed-line-added',
  updated: 'bb-changed-line-modified',
  removed: 'bb-changed-line-removed',
};

const COLOR_BY_ACTION: Record<CopilotEditChangeAction, string> = {
  added: '#4ec94e',
  updated: '#dcdcaa',
  removed: '#f48771',
};

export function buildFocusedChangeDecorationSpecs(
  model: monaco.editor.ITextModel,
  change: CopilotEditChange,
): ChangeDecorationSpec[] {
  const lineNum = change.lineNumber;
  if (lineNum < 1 || lineNum > model.getLineCount()) return [];
  return [{
    range: wholeLineRange(model, lineNum),
    options: {
      isWholeLine: true,
      linesDecorationsClassName: `${CLASS_BY_ACTION[change.action]} bb-changed-line-focused`,
      overviewRulerColor: COLOR_BY_ACTION[change.action],
      overviewRulerLane: 4,
    },
  }];
}

export interface ReviewableCopilotChange extends CopilotEditChange {
  status: 'pending' | 'kept' | 'discarded';
}

export function pendingReviewChanges(changes: ReviewableCopilotChange[]): ReviewableCopilotChange[] {
  return changes.filter((change) => change.status === 'pending');
}
