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
  /** 0-based instance of this pattern in the expanded seq (consecutive repeats stay distinct). */
  patternIndex: number;
};

type StepAttribution = {
  patBase: string;
  seqPath: string[];
  /** Distinct pat reference slot — repeats and separate seq items get new IDs. */
  sourceRef: number;
};

type RefCounter = { next: number };

function allocSourceRef(counter: RefCounter): number {
  return counter.next++;
}

function seqItemsToStrings(rawSeqDef: unknown): string[] {
  if (!rawSeqDef) return [];
  if (Array.isArray(rawSeqDef) && rawSeqDef.length > 0 && typeof rawSeqDef[0] !== 'string') {
    return materializeSequenceItems(rawSeqDef as SequenceItem[]);
  }
  return rawSeqDef as string[];
}

/** Tokens that change instrument/pan without occupying a timeline row. */
export function isNonSoundingDirectiveToken(token: string): boolean {
  if (typeof token !== 'string') return false;
  if (/^inst\s+\S+$/i.test(token)) return true;
  if (/^pan\(/i.test(token)) return true;
  if (/^inst\([^,()\s]+(?:,\d+)?\)$/i.test(token)) return true;
  return false;
}

export function soundingTokenCount(tokens: string[]): number {
  return tokens.filter((t) => !isNonSoundingDirectiveToken(t)).length;
}

function stepKey(step: { patBase: string; seqPath: string[] }): string {
  return `${step.patBase}\0${step.seqPath.join('/')}`;
}

/** Mirror structural length/order ops from applyModsToTokens on a step-attribution stream. */
function applyStepStreamMods(stream: StepAttribution[], mods: string[]): StepAttribution[] {
  let steps = stream.slice();
  for (const mod of mods) {
    if (/^rev$/i.test(mod)) {
      steps = steps.slice().reverse();
      continue;
    }
    const mRot = mod.match(/^rot(?:ate)?\(([+-]?\d+)\)$/i);
    if (mRot) {
      const len = steps.length;
      if (len > 0) {
        const n = parseInt(mRot[1], 10);
        const shift = ((n % len) + len) % len;
        if (shift !== 0) steps = steps.slice(shift).concat(steps.slice(0, shift));
      }
      continue;
    }
    if (/^pal(?:indrome)?$/i.test(mod)) {
      steps =
        steps.length <= 1 ? steps.slice() : steps.concat(steps.slice(0, -1).reverse());
      continue;
    }
    const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
    if (mSlow) {
      const factor = mSlow[1] ? parseInt(mSlow[1], 10) : 2;
      const outArr: StepAttribution[] = [];
      for (const step of steps) {
        for (let r = 0; r < factor; r++) outArr.push(step);
      }
      steps = outArr;
      continue;
    }
    const mFast = mod.match(/^fast(?:\((\d+)\))?$/i);
    if (mFast) {
      const factor = mFast[1] ? parseInt(mFast[1], 10) : 2;
      steps = steps.filter((_, idx) => idx % factor === 0);
    }
  }
  return steps;
}

function recompressSteps(stream: StepAttribution[]): TokenSourceLeaf[] {
  const out: TokenSourceLeaf[] = [];
  for (const step of stream) {
    const last = out[out.length - 1];
    if (last && last.patBase === step.patBase && stepKey(last) === stepKey(step)) {
      last.count++;
    } else {
      out.push({ patBase: step.patBase, count: 1, seqPath: step.seqPath });
    }
  }
  return out;
}

function expandItemToStepStream(
  seqItem: string,
  seqs: Record<string, unknown>,
  pats: Record<string, string[]>,
  seqPath: string[] = [],
  visited = new Set<string>(),
  refCounter: RefCounter = { next: 0 },
): StepAttribution[] {
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

  const expandBase = (): StepAttribution[] => {
    let stream: StepAttribution[] = [];
    const mGroup = base.match(/^\((.*)\)$/s);
    if (mGroup) {
      const innerParts = mGroup[1].trim().match(/[^\s]+/g) || [];
      for (const inner of innerParts) {
        stream.push(...expandItemToStepStream(inner, seqs, pats, seqPath, visited, refCounter));
      }
    } else if (pats[base]) {
      const ref = allocSourceRef(refCounter);
      const count = soundingTokenCount(pats[base]);
      for (let i = 0; i < count; i++) {
        stream.push({ patBase: base, seqPath: [...seqPath], sourceRef: ref });
      }
    } else if (seqs[base]) {
      if (visited.has(base)) return [];
      visited.add(base);
      const nextPath = [...seqPath, base];
      const innerItems = seqItemsToStrings(seqs[base]);
      for (const inner of innerItems) {
        if (!inner || inner.trim() === '') continue;
        stream.push(...expandItemToStepStream(inner, seqs, pats, nextPath, visited, refCounter));
      }
      visited.delete(base);
    } else {
      const ref = allocSourceRef(refCounter);
      stream.push({ patBase: base, seqPath: [...seqPath], sourceRef: ref });
    }
    return stream;
  };

  const out: StepAttribution[] = [];
  for (let r = 0; r < repeat; r++) {
    let unit = expandBase();
    unit = applyStepStreamMods(unit, mods);
    out.push(...unit);
  }
  return out;
}

function streamToMeta(stream: StepAttribution[], outerSeqName: string): TokenSourceMeta[] {
  let patternIndex = 0;
  let lastRef = -1;
  return stream.map((step) => {
    if (lastRef !== -1 && step.sourceRef !== lastRef) patternIndex++;
    lastRef = step.sourceRef;
    const seqPath = step.seqPath.length > 0 ? step.seqPath : [outerSeqName];
    return {
      patBase: step.patBase,
      seqName: seqPath[seqPath.length - 1] || outerSeqName,
      seqPath,
      patternIndex,
    };
  });
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
  return recompressSteps(expandItemToStepStream(seqItem, seqs, pats, seqPath, visited));
}

function leafToMeta(leaf: TokenSourceLeaf, outerSeqName: string, patternIndex: number): TokenSourceMeta {
  const seqPath = leaf.seqPath.length > 0 ? leaf.seqPath : [outerSeqName];
  return {
    patBase: leaf.patBase,
    seqName: seqPath[seqPath.length - 1] || outerSeqName,
    seqPath,
    patternIndex,
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
 * outerMods: modifiers on the outer sequence reference (e.g. fast(2) in `mel:fast(2)`)
 */
export function buildTokenSourceMeta(
  seqItems: string[],
  totalTokens: number,
  pats: Record<string, string[]>,
  seqs: Record<string, unknown>,
  outerSeqName: string,
  outerMods: string[] = [],
): TokenSourceMeta[] {
  if (seqItems.length === 0 || totalTokens === 0) return [];

  let stream: StepAttribution[] = [];
  const refCounter: RefCounter = { next: 0 };
  for (const item of seqItems) {
    stream.push(...expandItemToStepStream(item, seqs, pats, [outerSeqName], new Set(), refCounter));
  }
  stream = applyStepStreamMods(stream, outerMods);

  if (stream.length === totalTokens) {
    return streamToMeta(stream, outerSeqName);
  }

  const leaves = recompressSteps(stream);

  let rawTotal = 0;
  for (const leaf of leaves) rawTotal += leaf.count;

  const fallback = leafToMeta(
    { patBase: '', count: 1, seqPath: [outerSeqName] },
    outerSeqName,
    0,
  );

  if (rawTotal === 0) return Array(totalTokens).fill(fallback);

  const result: TokenSourceMeta[] = [];
  for (let i = 0; i < leaves.length; i++) {
    const isLast = i === leaves.length - 1;
    const scaledCount = isLast
      ? (totalTokens - result.length)
      : Math.round((leaves[i].count / rawTotal) * totalTokens);
    const meta = leafToMeta(leaves[i], outerSeqName, i);
    for (let j = 0; j < scaledCount; j++) result.push(meta);
  }

  while (result.length < totalTokens) result.push(result[result.length - 1] || fallback);
  return result.slice(0, totalTokens);
}
