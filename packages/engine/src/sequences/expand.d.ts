import { SequenceItem } from '../parser/ast.js';
export declare function expandSequenceItems(items: (string | SequenceItem)[], pats: Record<string, string[]>, insts?: Record<string, any>, _missingWarned?: Set<string>, presets?: Record<string, string>, seqs?: Record<string, string[] | SequenceItem[]>, _seqVisiting?: Set<string>): string[];
export declare function expandAllSequences(seqs: Record<string, string[] | SequenceItem[]>, pats: Record<string, string[]>, insts?: Record<string, any>, presets?: Record<string, string>): Record<string, string[]>;
declare const _default: {
    expandSequenceItems: typeof expandSequenceItems;
    expandAllSequences: typeof expandAllSequences;
};
export default _default;
//# sourceMappingURL=expand.d.ts.map