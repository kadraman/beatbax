import type { SourceLocation } from '../parser/ast.js';
export interface ModResult {
    tokens: string[];
    instOverride?: string | null;
    panOverride?: string | undefined;
}
export declare function applyModsToTokens(tokensIn: string[], mods: string[], presets?: Record<string, string>, loc?: SourceLocation): ModResult;
export declare function expandRefToTokens(itemRef: string, expandedSeqs: Record<string, string[]>, pats: Record<string, string[]>, presets?: Record<string, string>, loc?: SourceLocation): string[];
declare const _default: {
    applyModsToTokens: typeof applyModsToTokens;
    expandRefToTokens: typeof expandRefToTokens;
};
export default _default;
//# sourceMappingURL=refExpander.d.ts.map