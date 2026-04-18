import { PatternEvent, SequenceItem, SequenceTransform, SourceLocation } from './ast.js';
export interface RawSeqModifier {
    raw: string;
    loc?: SourceLocation;
}
export interface RawSeqItem {
    name: string;
    modifiers: RawSeqModifier[];
    raw?: string;
    loc?: SourceLocation;
}
export declare const patternEventsToTokens: (events?: PatternEvent[]) => string[];
export declare const parseSeqTransforms: (mods: RawSeqModifier[]) => SequenceTransform[];
export declare const normalizeSeqItems: (items?: RawSeqItem[], rhs?: string, rhsTokens?: string[]) => SequenceItem[];
export declare const materializeSequenceItems: (items: SequenceItem[]) => string[];
//# sourceMappingURL=structured.d.ts.map