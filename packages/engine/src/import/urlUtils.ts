/**
 * URL utilities for remote instrument imports.
 * Handles URL detection, GitHub shorthand expansion, and validation.
 */

/**
 * Check if an import source is a remote URL.
 */
export function isRemoteImport(source: string): boolean {
  return (
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('github:')
  );
}

/**
 * Check if an import source is a local file import.
 */
export function isLocalImport(source: string): boolean {
  return source.startsWith('local:');
}

/**
 * Extract the file path from a local import.
 * @example
 * extractLocalPath('local:lib/common.ins') => 'lib/common.ins'
 */
export function extractLocalPath(source: string): string {
  if (source.startsWith('local:')) {
    return source.slice('local:'.length);
  }
  return source;
}

/**
 * Expand GitHub shorthand syntax to a full raw.githubusercontent.com URL.
 * @example
 * expandGitHubShorthand('github:user/repo/main/file.ins')
 * => 'https://raw.githubusercontent.com/user/repo/main/file.ins'
 */
export function expandGitHubShorthand(source: string): string {
  if (source.startsWith('github:')) {
    const path = source.slice('github:'.length);
    return `https://raw.githubusercontent.com/${path}`;
  }
  return source;
}

/**
 * Normalize a remote import URL.
 * - Expands GitHub shorthand
 * - Validates protocol
 * - Returns the canonical URL
 */
export function normalizeRemoteUrl(source: string): string {
  const expanded = expandGitHubShorthand(source);

  // Validate that we have a valid HTTP(S) URL
  try {
    const url = new URL(expanded);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Invalid protocol: ${url.protocol}`);
    }
    return expanded;
  } catch (err) {
    throw new Error(`Invalid remote import URL "${source}": ${err}`);
  }
}

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
export function validateRemoteUrl(
  url: string,
  options: RemoteImportSecurityOptions = {}
): void {
  const {
    httpsOnly = false,
    allowedDomains = [],
  } = options;

  const parsedUrl = new URL(url);

  // Check HTTPS requirement
  if (httpsOnly && parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Remote import security violation: HTTP URLs are not allowed in production mode. ` +
      `Use HTTPS or set httpsOnly=false. URL: ${url}`
    );
  }

  // Check domain whitelist
  if (allowedDomains.length > 0) {
    const hostname = parsedUrl.hostname.toLowerCase();
    const isAllowed = allowedDomains.some(domain => {
      const normalizedDomain = domain.toLowerCase();
      return hostname === normalizedDomain || hostname.endsWith('.' + normalizedDomain);
    });

    if (!isAllowed) {
      throw new Error(
        `Remote import security violation: domain "${parsedUrl.hostname}" is not in the allowed list. ` +
        `Allowed domains: ${allowedDomains.join(', ')}`
      );
    }
  }
}
