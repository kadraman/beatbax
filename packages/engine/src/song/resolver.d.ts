import { AST } from '../parser/ast.js';
import { SongModel } from './songModel.js';
/**
 * Resolve an AST into a SongModel (ISM), expanding sequences and resolving
 * instrument overrides according to the language expansion pipeline.
 */
export declare function resolveSong(ast: AST): SongModel;
declare const _default: {
    resolveSong: typeof resolveSong;
};
export default _default;
//# sourceMappingURL=resolver.d.ts.map