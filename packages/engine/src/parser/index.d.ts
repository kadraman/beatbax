import { AST } from './ast.js';
export interface ParseError {
    message: string;
    loc?: any;
    type: 'syntax' | 'recovery';
}
export interface ParseResult {
    ast: AST;
    errors: ParseError[];
    hasErrors: boolean;
}
/**
 * Parse source text and build a minimal AST. Currently this parser
 * focuses on resolving `pat` definitions into expanded token arrays
 * using `expandPattern` and collecting `inst`, `seq` and `channel` entries.
 */
export declare function parse(source: string): AST;
export declare function parseWithPeggy(source: string): ParseResult;
declare const _default: {
    parse: typeof parse;
};
export default _default;
//# sourceMappingURL=index.d.ts.map
// Note: tokenizer re-exports removed — legacy tokenizer is deprecated/removed.
//# sourceMappingURL=index.d.ts.map
