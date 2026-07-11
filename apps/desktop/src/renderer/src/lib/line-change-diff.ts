/** Line-level diff between previous and applied song content. */
export interface AIChangeDiff {
  /** 1-based lines in the new file that were purely added (not replacements). */
  added: number[];
  /**
   * Pure deletions anchored to a line in the new file (the line after the gap).
   * The removed text is from the previous file.
   */
  removed: Array<{
    line: number;
    removed: Array<{ oldLine: number; text: string }>;
  }>;
  /**
   * In-place line replacements: old text removed and new text inserted at the
   * same position (e.g. fixing commas on one pattern line).
   */
  modified: Array<{
    line: number;
    removed: Array<{ oldLine: number; text: string }>;
    newLines: number[];
  }>;
}

/** User-facing line counts for banners and chat badges. */
export function countAIChangeDiff(diff: AIChangeDiff): {
  added: number;
  removed: number;
  modified: number;
  total: number;
} {
  const added = diff.added.length;
  const removed = diff.removed.reduce((n, a) => n + a.removed.length, 0);
  const modified = diff.modified.length;
  return { added, removed, modified, total: added + removed + modified };
}

export function formatAIChangeBanner(diff: AIChangeDiff): string {
  const { added, removed, modified } = countAIChangeDiff(diff);
  const parts: string[] = [];
  if (modified > 0) parts.push(`${modified} changed`);
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  if (parts.length === 0) return 'AI: no line changes';
  if (parts.length === 1) {
    if (modified > 0) return `AI: ${modified} line${modified !== 1 ? 's' : ''} changed`;
    if (added > 0) return `AI: ${added} line${added !== 1 ? 's' : ''} added`;
    return `AI: ${removed} line${removed !== 1 ? 's' : ''} removed`;
  }
  return `AI: ${parts.join(', ')}`;
}

/**
 * LCS DP table size above this uses a greedy line scan instead (avoids O(n·m)
 * allocations that can freeze the renderer on very large songs).
 */
export const LCS_DP_MAX_CELLS = 250_000;

/** Max lines to search ahead when resyncing during the greedy scan. */
const GREEDY_LOOKAHEAD = 32;

function diffLineChangesLcs(oldLines: string[], newLines: string[]): AIChangeDiff {
  const n = oldLines.length;
  const m = newLines.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const added: number[] = [];
  const removed: AIChangeDiff['removed'] = [];
  let i = 0;
  let j = 0;

  while (i < n || j < m) {
    if (i < n && j < m && oldLines[i] === newLines[j]) {
      i++;
      j++;
      continue;
    }
    if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) {
      const batch: Array<{ oldLine: number; text: string }> = [];
      while (i < n && (j >= m || (oldLines[i] !== newLines[j] && dp[i + 1][j] >= dp[i][j + 1]))) {
        batch.push({ oldLine: i + 1, text: oldLines[i] });
        i++;
      }
      const anchor = j < m ? j + 1 : Math.max(1, m);
      if (batch.length > 0) removed.push({ line: anchor, removed: batch });
    } else if (j < m) {
      added.push(j + 1);
      j++;
    } else {
      i++;
    }
  }

  return { added, removed, modified: [] };
}

/**
 * O(n+m) approximate line diff for very large inputs. Decorations are a UX
 * hint only — exact LCS alignment is not required in the worst case.
 */
function diffLineChangesGreedy(oldLines: string[], newLines: string[]): AIChangeDiff {
  const added: number[] = [];
  const removed: AIChangeDiff['removed'] = [];
  let i = 0;
  let j = 0;

  const pushRemoved = (batch: Array<{ oldLine: number; text: string }>) => {
    if (batch.length === 0) return;
    const anchor = j < newLines.length ? j + 1 : Math.max(1, newLines.length);
    removed.push({ line: anchor, removed: batch });
  };

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++;
      j++;
      continue;
    }

    let resyncNew = -1;
    let resyncOld = -1;
    const newLimit = Math.min(j + GREEDY_LOOKAHEAD, newLines.length);
    const oldLimit = Math.min(i + GREEDY_LOOKAHEAD, oldLines.length);
    for (let k = j; k < newLimit; k++) {
      if (i < oldLines.length && oldLines[i] === newLines[k]) {
        resyncNew = k;
        break;
      }
    }
    for (let k = i; k < oldLimit; k++) {
      if (j < newLines.length && newLines[j] === oldLines[k]) {
        resyncOld = k;
        break;
      }
    }

    if (resyncNew >= 0 && (resyncOld < 0 || resyncNew - j <= resyncOld - i)) {
      while (j < resyncNew) {
        added.push(j + 1);
        j++;
      }
      continue;
    }
    if (resyncOld >= 0) {
      const batch: Array<{ oldLine: number; text: string }> = [];
      while (i < resyncOld) {
        batch.push({ oldLine: i + 1, text: oldLines[i] });
        i++;
      }
      pushRemoved(batch);
      continue;
    }

    const batch: Array<{ oldLine: number; text: string }> = [];
    if (i < oldLines.length) {
      batch.push({ oldLine: i + 1, text: oldLines[i] });
      i++;
    }
    pushRemoved(batch);
    if (j < newLines.length) {
      added.push(j + 1);
      j++;
    }
  }

  return { added, removed, modified: [] };
}

function collapseModifications(raw: AIChangeDiff): AIChangeDiff {
  const addedSet = new Set(raw.added);
  const modified: AIChangeDiff['modified'] = [];
  const pureRemoved: AIChangeDiff['removed'] = [];

  for (const anchor of raw.removed) {
    const start = anchor.line;
    const newLineNums: number[] = [];
    let line = start;
    while (addedSet.has(line)) {
      newLineNums.push(line);
      addedSet.delete(line);
      line++;
    }
    if (newLineNums.length > 0) {
      modified.push({ line: start, removed: anchor.removed, newLines: newLineNums });
    } else {
      pureRemoved.push(anchor);
    }
  }

  return { added: [...addedSet], removed: pureRemoved, modified };
}

/**
 * Line diff between two song versions. Uses exact LCS for normal-sized songs and
 * a greedy scan when n·m would exceed {@link LCS_DP_MAX_CELLS}.
 */
export function computeLineChangeDiff(previous: string, next: string): AIChangeDiff {
  const oldLines = previous.split('\n');
  const newLines = next.split('\n');
  const n = oldLines.length;
  const m = newLines.length;

  const raw = n * m > LCS_DP_MAX_CELLS
    ? diffLineChangesGreedy(oldLines, newLines)
    : diffLineChangesLcs(oldLines, newLines);

  return collapseModifications(raw);
}
