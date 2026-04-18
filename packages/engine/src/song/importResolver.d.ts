/**
 * Import resolution for .ins files.
 * Handles loading, caching, cycle detection, and merging of instrument definitions.
 * Supports both local file imports and remote HTTP(S) imports.
 */
import { AST } from '../parser/ast.js';
import { RemoteInstrumentCache, RemoteImportOptions } from '../import/remoteCache.js';
export interface ImportResolverOptions {
    /** Base file path for resolving relative imports */
    baseFilePath?: string;
    /** Additional search paths for resolving imports */
    searchPaths?: string[];
    /** Strict mode: treat instrument name overrides as errors instead of warnings */
    strictMode?: boolean;
    /** Warning handler */
    onWarn?: (message: string, loc?: any) => void;
    /** File system reader for testing */
    readFile?: (filePath: string) => string;
    /** File existence checker for testing */
    fileExists?: (filePath: string) => boolean;
    /** Allow absolute paths in imports (disabled by default for security) */
    allowAbsolutePaths?: boolean;
    /** Remote import options (timeout, HTTPS-only, etc.) */
    remoteOptions?: RemoteImportOptions;
    /** Remote instrument cache (reused across multiple resolve calls) */
    remoteCache?: RemoteInstrumentCache;
}
/**
 * Resolve all imports in an AST and merge them into the instrument table.
 * Returns a new AST with merged instruments.
 * Supports both local file imports and remote HTTP(S) imports.
 */
export declare function resolveImports(ast: AST, options?: ImportResolverOptions): Promise<AST>;
/**
 * Synchronous wrapper for resolveImports for backward compatibility.
 * Does not support remote imports - throws an error if remote imports are encountered.
 * @deprecated Use resolveImports (async) instead
 */
export declare function resolveImportsSync(ast: AST, options?: ImportResolverOptions): AST;
//# sourceMappingURL=importResolver.d.ts.map