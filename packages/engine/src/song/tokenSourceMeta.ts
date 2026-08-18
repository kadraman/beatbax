import { SequenceItem } from '../parser/ast.js';
import { materializeSequenceItems } from '../parser/structured.js';
import { splitTopLevel } from '../expand/splitTopLevel.js';

export type TokenSourceLeaf = {
  patBase: string;
  count: number;
  seqPath: string[];
};

export type TokenSourceMeta = {
  patBase: string;
  /** Innermost named sequence that contains this token. */
  seqName: string;
  /** Outer-to-inner sequence path, e.g. `['mel', 'deep']`. */
  seqPath: string[];
};

function seqItemsToStrings(rawSeqDef: unknown): string[] {
  if (!rawSeqDef) return [];
  if (Array.isArray(rawSeqDef) && rawSeqDef.length > 0 && typeof rawSeqDef[0] !== 'string') {
    return materializeSequenceItems(rawSeqDef as SequenceItem[]);
  }
  return rawSeqDef as string[];
}

/**
 * Walk a sequence item (which may itself be a nested seq) and return leaf
 * pattern contributions with the enclosing seq path.
 *
 * `seqPath` is the path of named sequences already entered *before* this item.
 * If this item is itself a named sequence, that name is appended for children.
 */
export function getLeafPats(
  seqItem: string,
  seqs: Record<string, unknown>,
  pats: Record<string, string[]>,
  seqPath: string[] = [],
  visited = new Set<string>(),
): TokenSourceLeaf[] {
  let realItem = seqItem.trim();
  let repeat = 1;
  const mRep = realItem.match(/^(.+?)\s*\*\s*(\d+)$/);
  if (mRep) {
    realItem = mRep[1].trim();
    repeat = parseInt(mRep[2], 10);
  }
  const parts = splitTopLevel(realItem, ':');
  const base = parts[0].trim();
  const mods = parts.slice(1);

  let mult = 1;
  for (const mod of mods) {
    const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
    if (mSlow) { mult *= mSlow[1] ? parseInt(mSlow[1], 10) : 2; continue; }
    const mFast = mod.match(/^fast(?:\((\d+)\))?$/i);
    if (mFast) { mult /= (mFast[1] ? parseInt(mFast[1], 10) : 2); continue; }
  }

  let children: TokenSourceLeaf[] = [];
  if (visited.has(base)) {
    return [];
  }

  if (pats[base]) {
    children = [{ patBase: base, count: pats[base].length, seqPath }];
  } else if (seqs[base]) {
    visited.add(base);
    const nextPath = [...seqPath, base];
    const innerItems = seqItemsToStrings(seqs[base]);
    for (const inner of innerItems) {
      if (!inner || inner.trim() === '') continue;
      children.push(...getLeafPats(inner, seqs, pats, nextPath, visited));
    }
    visited.delete(base);
  } else {
    children = [{ patBase: base, count: 1, seqPath }];
  }

  const out: TokenSourceLeaf[] = [];
  for (let r = 0; r < repeat; r++) {
    for (const c of children) {
      out.push({
        patBase: c.patBase,
        count: Math.max(1, Math.round(c.count * mult)),
        seqPath: c.seqPath,
      });
    }
  }
  return out;
}

function leafToMeta(leaf: TokenSourceLeaf, outerSeqName: string): TokenSourceMeta {
  const seqPath = leaf.seqPath.length > 0 ? leaf.seqPath : [outerSeqName];
  return {
    patBase: leaf.patBase,
    seqName: seqPath[seqPath.length - 1] || outerSeqName,
    seqPath,
  };
}

/**
 * For a named sequence, build a per-token array of source pattern and nested
 * sequence names.
 *
 * seqItems: the raw item strings for the sequence (e.g. ["deep", "land:slow"])
 * totalTokens: actual count of expanded tokens produced for this item invocation
 * outerSeqName: the sequence being expanded (the channel's immediate seq, or a
 *   nested name when this helper is reused)
 */
export function buildTokenSourceMeta(
  seqItems: string[],
  totalTokens: number,
  pats: Record<string, string[]>,
  seqs: Record<string, unknown>,
  outerSeqName: string,
): TokenSourceMeta[] {
  if (seqItems.length === 0 || totalTokens === 0) return [];

  const leaves: TokenSourceLeaf[] = [];
  for (const item of seqItems) {
    leaves.push(...getLeafPats(item, seqs, pats, [outerSeqName]));
  }

  let rawTotal = 0;
  for (const leaf of leaves) rawTotal += leaf.count;

  const fallback = leafToMeta(
    { patBase: '', count: 1, seqPath: [outerSeqName] },
    outerSeqName,
  );

  if (rawTotal === 0) return Array(totalTokens).fill(fallback);

  const result: TokenSourceMeta[] = [];
  for (let i = 0; i < leaves.length; i++) {
    const isLast = i === leaves.length - 1;
    const scaledCount = isLast
      ? (totalTokens - result.length)
      : Math.round((leaves[i].count / rawTotal) * totalTokens);
    const meta = leafToMeta(leaves[i], outerSeqName);
    for (let j = 0; j < scaledCount; j++) result.push(meta);
  }

  while (result.length < totalTokens) result.push(result[result.length - 1] || fallback);
  return result.slice(0, totalTokens);
}
