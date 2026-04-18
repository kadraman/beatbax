/**
 * Remote instrument cache for browser and Node.js environments.
 * Handles fetching, caching, and parsing of remote .ins files.
 */
import { InstMap } from '../parser/ast.js';
import { RemoteImportSecurityOptions } from './urlUtils.js';
export interface RemoteImportProgress {
    url: string;
    loaded: number;
    total: number | null;
}
export interface RemoteImportOptions extends RemoteImportSecurityOptions {
    /** Progress callback for loading feedback */
    onProgress?: (progress: RemoteImportProgress) => void;
    /** Custom fetch function (for testing or custom HTTP clients) */
    fetchFn?: typeof fetch;
}
/**
 * Cache manager for remote instrument imports.
 * Handles HTTP(S) fetching with security constraints, timeout, and progress reporting.
 */
export declare class RemoteInstrumentCache {
    private cache;
    private options;
    constructor(options?: RemoteImportOptions);
    /**
     * Fetch and parse a remote .ins file.
     * Returns cached result if available.
     */
    fetch(url: string): Promise<InstMap>;
    /**
     * Fetch a remote file from the network.
     */
    private fetchFromNetwork;
    /**
     * Validate that an AST contains only allowed node types for .ins files.
     * Remote .ins files may NOT contain import directives for security reasons.
     */
    private validateInsFile;
    /**
     * Clear the cache.
     */
    clear(): void;
    /**
     * Get cache statistics.
     */
    getStats(): {
        size: number;
        entries: {
            url: string;
            fetchedAt: string;
            instrumentCount: number;
        }[];
    };
    /**
     * Check if a URL is cached.
     */
    has(url: string): boolean;
}
//# sourceMappingURL=remoteCache.d.ts.map