import { transposePattern } from '../patterns/expand.js';
import { warn } from '../util/diag.js';
import { applyModsToTokens } from '../expand/refExpander.js';
import { SequenceItem } from '../parser/ast.js';
import { materializeSequenceItems } from '../parser/structured.js';

/**
 * Expand sequence definitions into flat token arrays by resolving pattern
 * references and applying sequence-level transforms (oct, rev, slow, fast,
 * semitone transposition, and inst(name) override which is emitted as an
 * `inst(name)` token preceding the pattern tokens).
 */
const splitTopLevel = (s: string, sep = ':'): string[] => {
  const out: string[] = [];
  let cur = '';
  let inS = false;
  let inD = false;
  let bracket = 0;
  let paren = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inD) { inS = !inS; cur += ch; continue; }
    if (ch === '"' && !inS) { inD = !inD; cur += ch; continue; }
    if (inS || inD) { cur += ch; continue; }
    if (ch === '[') { bracket++; cur += ch; continue; }
    if (ch === ']') { if (bracket > 0) bracket--; cur += ch; continue; }
    if (ch === '(') { paren++; cur += ch; continue; }
    if (ch === ')') { if (paren > 0) paren--; cur += ch; continue; }
    if (ch === sep && bracket === 0 && paren === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
};

export function expandSequenceItems(items: (string | SequenceItem)[], pats: Record<string, string[]>, insts?: Record<string, any>, _missingWarned?: Set<string>): string[] {
  const out: string[] = [];
  const missingWarned = _missingWarned || new Set<string>();

  // Normalize items to a string[] early so the rest of the expansion logic
  // can operate on a consistent type. If items are structured SequenceItem
  // objects, materialize them first.
  let itemStrs: string[];
  if (items && items.length > 0 && typeof items[0] === 'object') {
    try {
      itemStrs = materializeSequenceItems(items as SequenceItem[]);
    } catch (e) {
      itemStrs = (items as any[]).map(String);
    }
  } else {
    itemStrs = (items as any) as string[];
  }

  for (const it of itemStrs) {
    if (!it || it.trim() === '') continue;
    const parts = splitTopLevel(it, ':');
    const base = parts[0];
    const mods = parts.slice(1);

    // Support repetition syntax in sequence items: base may be "name*2" or a group "(A B)*2"
    let repeat = 1;
    const mRepBase = base.match(/^(.+?)\*(\d+)$/);
    let realBase = base;
    if (mRepBase) {
      realBase = mRepBase[1];
      repeat = parseInt(mRepBase[2], 10);
    }

    // If this is a parenthesized group, expand inner items recursively
    let tokens: string[] = [];
    const mGroup = realBase.match(/^\((.*)\)$/s);
    if (mGroup) {
      const inner = mGroup[1].trim();
      const innerParts = inner.match(/[^\s]+/g) || [];
      tokens = expandSequenceItems(innerParts, pats, insts, missingWarned);
    } else if (pats[realBase]) {
      tokens = pats[realBase].slice();
    } else {
      tokens = [realBase];
      // Only warn if realBase is not a known pattern AND not a known instrument
      const isInstrument = insts && insts[realBase];
      if (realBase && !missingWarned.has(realBase) && !isInstrument) {
        missingWarned.add(realBase);
        warn('sequences', `sequence item '${realBase}' referenced but no pattern named '${realBase}' was found.`);
      }
    }

    const res = applyModsToTokens(tokens, mods);
    tokens = res.tokens;

    for (let r = 0; r < repeat; r++) {
      out.push(...tokens);
    }
  }
  return out;
}

export function expandAllSequences(seqs: Record<string, string[] | SequenceItem[]>, pats: Record<string, string[]>, insts?: Record<string, any>): Record<string, string[]> {
  const res: Record<string, string[]> = {};
  for (const [name, items] of Object.entries(seqs)) {
    // items may be an array of strings or structured SequenceItem objects
    const expanded = expandSequenceItems(items as any, pats, insts);
    res[name] = expanded;
  }
  return res;
}

export default { expandSequenceItems, expandAllSequences };
