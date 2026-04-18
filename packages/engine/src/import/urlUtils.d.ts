/**
 * URL utilities for remote instrument imports.
 * Handles URL detection, GitHub shorthand expansion, and validation.
 */
/**
 * Check if an import source is a remote URL.
 */
export declare function isRemoteImport(source: string): boolean;
/**
 * Check if an import source is a local file import.
 */
export declare function isLocalImport(source: string): boolean;
/**
 * Extract the file path from a local import.
 * @example
 * extractLocalPath('local:lib/common.ins') => 'lib/common.ins'
 */
export declare function extractLocalPath(source: string): string;
/**
 * Expand GitHub shorthand syntax to a full raw.githubusercontent.com URL.
 * @example
 * expandGitHubShorthand('github:user/repo/main/file.ins')
 * => 'https://raw.githubusercontent.com/user/repo/main/file.ins'
 */
export declare function expandGitHubShorthand(source: string): string;
/**
 * Normalize a remote import URL.
 * - Expands GitHub shorthand
 * - Validates protocol
 * - Returns the canonical URL
 */
export declare function normalizeRemoteUrl(source: string): string;
/**
 * Security options for remote imports.
 */
export interface RemoteImportSecurityOptions {
    /** Only allow HTTPS URLs (recommended for production) */
    httpsOnly?: boolean;
    /** Maximum file size in bytes (default: 1MB) */
    maxFileSize?: number;
    /** Request timeout in milliseconds (default: 10000ms) */
    timeout?: number;
    /** Allowed domains (empty array = all domains allowed) */
    allowedDomains?: string[];
}
/**
 * Validate a remote URL against security constraints.
 */
export declare function validateRemoteUrl(url: string, options?: RemoteImportSecurityOptions): void;
//# sourceMappingURL=urlUtils.d.ts.map