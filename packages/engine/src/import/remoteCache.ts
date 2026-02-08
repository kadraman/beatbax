/**
 * Remote instrument cache for browser and Node.js environments.
 * Handles fetching, caching, and parsing of remote .ins files.
 */

import { InstMap } from '../parser/ast.js';
import { parse } from '../parser/index.js';
import {
  normalizeRemoteUrl,
  validateRemoteUrl,
  RemoteImportSecurityOptions,
} from './urlUtils.js';

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

interface CacheEntry {
  instruments: InstMap;
  fetchedAt: number;
  url: string;
}

/**
 * Cache manager for remote instrument imports.
 * Handles HTTP(S) fetching with security constraints, timeout, and progress reporting.
 */
export class RemoteInstrumentCache {
  private cache = new Map<string, CacheEntry>();
  private options: RemoteImportOptions;

  constructor(options: RemoteImportOptions = {}) {
    this.options = {
      httpsOnly: false,
      maxFileSize: 1024 * 1024, // 1MB default
      timeout: 10000, // 10 second default
      ...options,
    };
  }

  /**
   * Fetch and parse a remote .ins file.
   * Returns cached result if available.
   */
  async fetch(url: string): Promise<InstMap> {
    // Normalize and validate URL
    const normalizedUrl = normalizeRemoteUrl(url);
    validateRemoteUrl(normalizedUrl, this.options);

    // Check cache
    const cached = this.cache.get(normalizedUrl);
    if (cached) {
      return cached.instruments;
    }

    // Fetch from network
    const instruments = await this.fetchFromNetwork(normalizedUrl);

    // Cache the result
    this.cache.set(normalizedUrl, {
      instruments,
      fetchedAt: Date.now(),
      url: normalizedUrl,
    });

    return instruments;
  }

  /**
   * Fetch a remote file from the network.
   */
  private async fetchFromNetwork(url: string): Promise<InstMap> {
    const fetchFn = this.options.fetchFn || fetch;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const response = await fetchFn(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/plain, application/octet-stream',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch remote instruments from ${url}: ${response.status} ${response.statusText}`
        );
      }

      // Check Content-Length if available
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > this.options.maxFileSize!) {
          throw new Error(
            `Remote import file too large: ${size} bytes exceeds maximum of ${this.options.maxFileSize} bytes`
          );
        }
      }

      // Read response body
      const source = await response.text();

      // Validate size after reading
      const actualSize = new Blob([source]).size;
      if (actualSize > this.options.maxFileSize!) {
        throw new Error(
          `Remote import file too large: ${actualSize} bytes exceeds maximum of ${this.options.maxFileSize} bytes`
        );
      }

      // Report progress (complete)
      if (this.options.onProgress) {
        this.options.onProgress({
          url,
          loaded: actualSize,
          total: actualSize,
        });
      }

      // Parse the file
      let ast;
      try {
        ast = parse(source);
      } catch (err) {
        throw new Error(`Failed to parse remote import file from ${url}: ${err}`);
      }

      // Validate that it's a valid .ins file
      this.validateInsFile(ast, url);

      return ast.insts || {};
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `Remote import timeout: failed to fetch ${url} within ${this.options.timeout}ms`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Validate that an AST contains only allowed node types for .ins files.
   * Remote .ins files may NOT contain import directives for security reasons.
   */
  private validateInsFile(ast: any, url: string): void {
    // Remote .ins files should only contain instrument definitions
    // Check for disallowed nodes
    const disallowed: string[] = [];
    
    // Import directives are explicitly forbidden in remote .ins files
    if (ast.imports && ast.imports.length > 0) {
      disallowed.push('imports (nested imports are not allowed in remote .ins files)');
    }
    
    // Playback/structure directives
    if (Object.keys(ast.pats || {}).length > 0) disallowed.push('patterns');
    if (Object.keys(ast.seqs || {}).length > 0) disallowed.push('sequences');
    if ((ast.channels || []).length > 0) disallowed.push('channels');
    if (ast.arranges && Object.keys(ast.arranges).length > 0) disallowed.push('arranges');
    if (ast.play !== undefined) disallowed.push('play');
    
    // Top-level scalar directives (should not be in .ins files)
    if (ast.chip !== undefined) disallowed.push('chip');
    if (ast.bpm !== undefined) disallowed.push('bpm');
    if (ast.volume !== undefined) disallowed.push('volume');
    
    // Metadata
    if (ast.metadata !== undefined && Object.keys(ast.metadata).length > 0) {
      disallowed.push('metadata');
    }
    
    // Effect definitions
    if (ast.effects && Object.keys(ast.effects).length > 0) disallowed.push('effects');
    
    // Pattern events and structured patterns
    if (ast.patternEvents && Object.keys(ast.patternEvents).length > 0) {
      disallowed.push('patternEvents');
    }
    if (ast.sequenceItems && Object.keys(ast.sequenceItems).length > 0) {
      disallowed.push('sequenceItems');
    }
    
    // Check for any other non-standard properties that might be added
    const allowedKeys = new Set([
      'insts', 'imports', 'pats', 'seqs', 'channels', 'arranges', 'play',
      'chip', 'bpm', 'volume', 'metadata', 'effects', 'patternEvents', 'sequenceItems'
    ]);
    
    for (const key of Object.keys(ast)) {
      if (!allowedKeys.has(key) && key !== 'insts') {
        disallowed.push(`unknown property '${key}'`);
      }
    }

    if (disallowed.length > 0) {
      throw new Error(
        `Invalid remote .ins file "${url}": remote .ins files may only contain "inst" declarations. ` +
        `Found: ${disallowed.join(', ')}`
      );
    }
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.values()).map(entry => ({
        url: entry.url,
        fetchedAt: new Date(entry.fetchedAt).toISOString(),
        instrumentCount: Object.keys(entry.instruments).length,
      })),
    };
  }

  /**
   * Check if a URL is cached.
   */
  has(url: string): boolean {
    const normalizedUrl = normalizeRemoteUrl(url);
    return this.cache.has(normalizedUrl);
  }
}
