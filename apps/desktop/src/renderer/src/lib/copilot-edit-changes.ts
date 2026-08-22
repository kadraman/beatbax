import {
  collectBaxDefs,
  insertDefinitionLine,
  removeDefinitionLine,
  replaceDefinitionLine,
  type BaxDefKind,
} from './bax-def-index';

export type CopilotEditChangeAction = 'added' | 'updated' | 'removed';
export type CopilotChangeReviewStatus = 'pending' | 'kept' | 'discarded';

export interface CopilotEditChange {
  id: string;
  kind: BaxDefKind;
  name: string;
  action: CopilotEditChangeAction;
  previousLine?: string;
  nextLine?: string;
  /** Best line to scroll to while reviewing (1-based). */
  lineNumber: number;
  reviewStatus?: CopilotChangeReviewStatus;
}

const KIND_LABEL: Record<BaxDefKind, string> = {
  pattern: 'pattern',
  sequence: 'sequence',
  instrument: 'instrument',
  effect: 'effect',
  channel: 'channel',
};

export function describeCopilotEditChange(change: CopilotEditChange): string {
  const kind = KIND_LABEL[change.kind];
  if (change.action === 'added') return `Added ${kind} \`${change.name}\``;
  if (change.action === 'removed') return `Removed ${kind} \`${change.name}\``;
  return `Modified ${kind} \`${change.name}\``;
}

/** Collect semantic definition-level edits between two song versions. */
export function collectCopilotEditChanges(previous: string, next: string): CopilotEditChange[] {
  const before = collectBaxDefs(previous);
  const after = collectBaxDefs(next);
  const changes: CopilotEditChange[] = [];

  for (const [key, def] of after) {
    const prev = before.get(key);
    if (!prev) {
      changes.push({
        id: key,
        kind: def.kind,
        name: def.name,
        action: 'added',
        nextLine: def.line,
        lineNumber: def.lineNumber,
      });
    } else if (prev.body !== def.body) {
      changes.push({
        id: key,
        kind: def.kind,
        name: def.name,
        action: 'updated',
        previousLine: prev.line,
        nextLine: def.line,
        lineNumber: def.lineNumber,
      });
    }
  }

  for (const [key, def] of before) {
    if (!after.has(key)) {
      changes.push({
        id: key,
        kind: def.kind,
        name: def.name,
        action: 'removed',
        previousLine: def.line,
        lineNumber: def.lineNumber,
      });
    }
  }

  return changes.sort((a, b) => a.lineNumber - b.lineNumber);
}

/** Revert a single Copilot edit against the editor's current content. */
export function revertCopilotEditChange(
  content: string,
  change: CopilotEditChange,
  baseline: string,
): string {
  const baselineDefs = collectBaxDefs(baseline);
  const currentDefs = collectBaxDefs(content);

  if (change.action === 'added') {
    const current = currentDefs.get(change.id);
    if (!current) return content;
    return removeDefinitionLine(content, current) ?? content;
  }

  if (change.action === 'updated') {
    const previous = baselineDefs.get(change.id);
    if (!previous) return content;
    return replaceDefinitionLine(content, previous) ?? content;
  }

  const previous = baselineDefs.get(change.id);
  if (!previous) return content;
  return insertDefinitionLine(content, previous);
}

/** Refresh scroll targets after the editor content changes during review. */
export function refreshCopilotEditChangeLines(content: string, changes: CopilotEditChange[]): CopilotEditChange[] {
  const defs = collectBaxDefs(content);
  return changes.map((change) => {
    const def = defs.get(change.id);
    if (def) return { ...change, lineNumber: def.lineNumber };
    return change;
  });
}

export function buildLegacyChangeSummary(changes: CopilotEditChange[], notes: string[] = []): string[] {
  const bullets = changes.map((change) => {
    if (change.action === 'added') {
      return `Added ${KIND_LABEL[change.kind]} \`${change.name}\` — \`${clipLine(change.nextLine)}\``;
    }
    if (change.action === 'removed') {
      return `Removed ${KIND_LABEL[change.kind]} \`${change.name}\` — \`${clipLine(change.previousLine)}\``;
    }
    return `Updated ${KIND_LABEL[change.kind]} \`${change.name}\` — \`${clipLine(change.nextLine)}\` (was: \`${clipLine(change.previousLine)}\`)`;
  });
  return [...notes, ...bullets];
}

function clipLine(line: string | undefined, max = 56): string {
  const trimmed = (line ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '(empty line)';
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function resolveCopilotChangeLineNumber(content: string, changeId: string, fallbackLine: number): number {
  return collectBaxDefs(content).get(changeId)?.lineNumber ?? fallbackLine;
}

export function formatCopilotReviewBannerLabel(change: CopilotEditChange, index: number, total: number): string {
  return `${describeCopilotEditChange(change)} (${index + 1}/${total})`;
}
