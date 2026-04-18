import { parseWithPeggy } from './peggy/index.js';
export { parseWithPeggy } from './peggy/index.js';
export function parse(source) {
    // Normalize Windows CRLF / bare CR to LF so the parser handles files
    // saved on Windows or in editors that use CRLF line endings.
    const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Peggy parser is the single supported parser now.
    const result = parseWithPeggy(normalized);
    if (result.hasErrors) {
        const first = result.errors[0];
        if (!first)
            throw new Error('Parse error');
        const err = new Error(first?.message ?? 'Parse error');
        if (first?.loc) {
            err.location = first.loc;
            err.loc = first.loc;
        }
        throw err;
    }
    return result.ast;
}
export default {
    parse,
};
//# sourceMappingURL=index.js.map