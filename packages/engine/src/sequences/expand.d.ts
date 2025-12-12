/**
 * Expand sequence definitions into flat token arrays by resolving pattern
 * references and applying sequence-level transforms (oct, rev, slow, fast,
 * semitone transposition, and inst(name) override which is emitted as an
 * `inst(name)` token preceding the pattern tokens).
 */
export declare function expandSequenceItems(items: string[], pats: Record<string, string[]>): string[];
export declare function expandAllSequences(seqs: Record<string, string[]>, pats: Record<string, string[]>): Record<string, string[]>;
declare const _default: {
    expandSequenceItems: typeof expandSequenceItems;
    expandAllSequences: typeof expandAllSequences;
};
export default _default;
//# sourceMappingURL=expand.d.ts.map