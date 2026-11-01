import {
  collectBaxDefs,
  definitionMoved,
  insertDefinitionLine,
  removeDefinitionLine,
  replaceDefinitionLine,
  type BaxDef,
  type BaxDefKind,
} from './bax-def-index';
import { matchLineEndings } from './line-change-diff';

export type CopilotEditChangeAction = 'added' | 'updated' | 'removed' | 'moved';
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
  if (change.action === 'moved') return `Moved ${kind} \`${change.name}\``;
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
    } else if (definitionMoved(previous, prev, next, def)) {
      changes.push({
        id: key,
        kind: def.kind,
        name: def.name,
        action: 'moved',
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

/**
 * pat/seq/effect names an Edit explanation mentions that were not changed.
 * Empty when any mentioned definition did change, so an explanation that notes
 * "kept melody_pat as-is" next to a real edit is not flagged. Instrument names
 * are skipped because they are often ordinary words ("a snare hit").
 */
export function unchangedDefinitionsMentioned(explanation: string, previous: string, next: string): string[] {
  if (!explanation.trim()) return [];
  const changed = new Set(collectCopilotEditChanges(previous, next)
    .filter((change) => change.action !== 'moved')
    .map((change) => change.name));
  const known = new Set<string>();
  for (const def of [...collectBaxDefs(previous).values(), ...collectBaxDefs(next).values()]) {
    if (def.kind === 'pattern' || def.kind === 'sequence' || def.kind === 'effect') known.add(def.name);
  }
  const mentioned = [...known].filter((name) => new RegExp(`\\b${name}\\b`).test(explanation));
  if (mentioned.length === 0 || mentioned.some((name) => changed.has(name))) return [];
  return mentioned;
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

  if (change.action === 'moved') {
    const previous = baselineDefs.get(change.id);
    const current = currentDefs.get(change.id);
    if (!previous || !current) return content;
    const without = removeDefinitionLine(content, current);
    if (!without) return content;
    return insertDefinitionLine(without, previous);
  }

  const previous = baselineDefs.get(change.id);
  if (!previous) return content;
  return insertDefinitionLine(content, previous);
}

function defFromChangeLine(change: CopilotEditChange, line: string): BaxDef | null {
  const trimmed = line.trim();
  const match = trimmed.match(
    change.kind === 'instrument'
      ? /^inst\s+([A-Za-z_]\w*)\s+(.*)$/
      : change.kind === 'channel'
        ? /^channel\s+(\d+)\s*=>\s*(.*)$/
        : /^(?:pat|seq|effect)\s+([A-Za-z_]\w*)\s*=\s*(.*)$/,
  );
  if (!match) return null;
  return {
    kind: change.kind,
    name: change.name,
    body: match[2].replace(/\s+/g, ' ').trim(),
    line: trimmed,
    lineNumber: 0,
  };
}

/** Apply a single kept Copilot edit onto baseline-derived content. */
export function applyCopilotEditChange(content: string, change: CopilotEditChange): string {
  if (change.action === 'added') {
    if (!change.nextLine) return content;
    const def = defFromChangeLine(change, change.nextLine);
    if (!def) return content;
    return insertDefinitionLine(content, def);
  }

  if (change.action === 'updated') {
    if (!change.nextLine) return content;
    const def = defFromChangeLine(change, change.nextLine);
    if (!def) return content;
    return replaceDefinitionLine(content, def) ?? content;
  }

  if (change.action === 'moved') {
    if (!change.nextLine) return content;
    const current = collectBaxDefs(content).get(change.id);
    const def = defFromChangeLine(change, change.nextLine);
    if (!current || !def) return content;
    const without = removeDefinitionLine(content, current);
    if (!without) return content;
    return insertDefinitionLine(without, def);
  }

  const current = collectBaxDefs(content).get(change.id);
  if (!current) return content;
  return removeDefinitionLine(content, current) ?? content;
}

/**
 * Discard every pending change. Rebuilds from the pre-edit baseline and
 * reapplies only kept definition edits so comment / blank residue the model
 * added outside definitions does not survive (issue #218).
 */
export function discardRemainingCopilotEditChanges<T extends CopilotEditChange & { status: CopilotChangeReviewStatus }>(
  _content: string,
  changes: T[],
  baseline: string,
): { content: string; changes: T[] } {
  const settled = changes.map((change): T => (
    change.status === 'pending' ? { ...change, status: 'discarded' } : change
  ));
  const kept = settled.filter((change) => change.status === 'kept');
  let next = baseline;
  for (const change of kept) {
    next = applyCopilotEditChange(next, change);
  }
  next = matchLineEndings(next, baseline);
  return { content: next, changes: refreshCopilotEditChangeLines(next, settled) };
}

/** Refresh scroll targets after the editor content changes during review. */
export function refreshCopilotEditChangeLines<T extends CopilotEditChange>(
  content: string,
  changes: T[],
): T[] {
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
    if (change.action === 'moved') {
      return `Moved ${KIND_LABEL[change.kind]} \`${change.name}\` — \`${clipLine(change.nextLine)}\``;
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
