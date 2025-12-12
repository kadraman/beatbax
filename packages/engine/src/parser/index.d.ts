export * from './tokenizer.js';
import { AST } from './ast.js';
/**
 * Parse source text and build a minimal AST. Currently this parser
 * focuses on resolving `pat` definitions into expanded token arrays
 * using `expandPattern` and collecting `inst`, `seq` and `channel` entries.
 */
export declare function parse(source: string): AST;
declare const _default: {
    parse: typeof parse;
};
export default _default;
export * from './tokenizer.js';
//# sourceMappingURL=index.d.ts.map