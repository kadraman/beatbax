import { AST } from '../parser/ast.js';
import { SongModel } from './songModel.js';
export declare function isPanEmpty(pan: any): boolean;
export declare function parseEffectParams(paramsStr: string | undefined): Array<string | number>;
export declare function parseEffectsInline(str: string): {
    effects: {
        type: string;
        params: Array<string | number>;
        paramsStr?: string;
    }[];
    pan: any;
};
/**
 * Resolve an AST into a SongModel (ISM), expanding sequences and resolving
 * instrument overrides according to the language expansion pipeline.
 *
 * Note: This function does not support remote imports. For remote imports,
 * use resolveSongAsync() instead.
 */
export declare function resolveSong(ast: AST, opts?: {
    filename?: string;
    searchPaths?: string[];
    strictInstruments?: boolean;
    onWarn?: (d: {
        component: string;
        message: string;
        file?: string;
        loc?: any;
    }) => void;
}): SongModel;
/**
 * Async version of resolveSong that supports remote imports.
 * Use this when your AST may contain remote imports (http://, https://, github:).
 */
export declare function resolveSongAsync(ast: AST, opts?: {
    filename?: string;
    searchPaths?: string[];
    strictInstruments?: boolean;
    onWarn?: (d: {
        component: string;
        message: string;
        file?: string;
        loc?: any;
    }) => void;
}): Promise<SongModel>;
declare const _default: {
    resolveSong: typeof resolveSong;
};
export default _default;
//# sourceMappingURL=resolver.d.ts.map