/**
 * Remote loader - Load .bax files from URLs
 * Part of Phase 3: Export & Import
 */

import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:remote-loader');

/**
 * Options for remote loading
 */
export interface RemoteLoaderOptions {
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Whether to only allow HTTPS URLs (default: false) */
  httpsOnly?: boolean;
}

/**
 * Result of a remote load operation
 */
export interface RemoteLoadResult {
  url: string;
  content: string;
  filename: string;
}

/**
 * Convert a GitHub URL to a raw content URL
 * Handles:
 * - https://github.com/user/repo/blob/branch/path
 * - github:user/repo/path
 */
function resolveGitHubUrl(url: string): string | null {
  // github: shorthand
  if (url.startsWith('github:')) {
    const path = url.slice(7);
    return `https://raw.githubusercontent.com/${path.replace('/blob/', '/')}`;
  }

  // Full GitHub URL
  const match = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/
  );
  if (match) {
    const [, user, repo, rest] = match;
    return `https://raw.githubusercontent.com/${user}/${repo}/${rest}`;
  }

  return null;
}

/**
 * Extract a filename from a URL
 */
function filenameFromUrl(url: string): string {
  const parts = url.split('/');
  const last = parts[parts.length - 1];
  // Strip query string
  const base = last.split('?')[0];
  return base || 'remote.bax';
}

/**
 * Fetch a text resource from a URL
 */
async function fetchText(
  url: string,
  options: RemoteLoaderOptions = {}
): Promise<string> {
  const { timeout = 10000, httpsOnly = false } = options;

  if (httpsOnly && !url.startsWith('https://')) {
    throw new Error(`Only HTTPS URLs are allowed (got: ${url})`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText} fetching ${url}`);
    }
    return await resp.text();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out fetching ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load a .bax file from a URL (supports GitHub shorthand)
 */
export async function loadRemote(
  url: string,
  options: RemoteLoaderOptions = {}
): Promise<RemoteLoadResult> {
  let resolvedUrl = url;

  // Resolve GitHub shorthand
  const githubUrl = resolveGitHubUrl(url);
  if (githubUrl) {
    resolvedUrl = githubUrl;
    log.debug(`Resolved GitHub URL: ${url} -> ${resolvedUrl}`);
  }

  log.debug(`Fetching: ${resolvedUrl}`);
  const content = await fetchText(resolvedUrl, options);
  const filename = filenameFromUrl(resolvedUrl);

  log.debug(`Loaded ${filename} (${content.length} bytes) from ${resolvedUrl}`);
  return { url: resolvedUrl, content, filename };
}

/**
 * Load from URL query parameters
 * Supports: ?song=path&autoplay=1
 */
export async function loadFromQueryParams(
  searchParams: URLSearchParams,
  options: RemoteLoaderOptions = {}
): Promise<RemoteLoadResult | null> {
  const songParam = searchParams.get('song');
  if (!songParam) return null;

  try {
    return await loadRemote(songParam, options);
  } catch (err) {
    log.warn('Failed to load from query params:', err);
    return null;
  }
}

/**
 * Built-in example songs (relative paths served by Vite)
 */
export const EXAMPLE_SONGS: Array<{ label: string; path: string }> = [
  { label: 'sample.bax', path: '/songs/sample.bax' },
  { label: 'instrument_demo.bax', path: '/songs/instrument_demo.bax' },
  { label: 'percussion_demo.bax', path: '/songs/percussion_demo.bax' },
  { label: 'sequence_demo.bax', path: '/songs/sequence_demo.bax' },
  { label: 'metadata_example.bax', path: '/songs/metadata_example.bax' },
];

/**
 * RemoteLoader class - manages remote URL loading
 */
export class RemoteLoader {
  constructor(private options: RemoteLoaderOptions = {}) {}

  async load(url: string): Promise<RemoteLoadResult> {
    return loadRemote(url, this.options);
  }

  async loadExample(path: string): Promise<RemoteLoadResult> {
    const fullUrl = path.startsWith('/') ? path : `/${path}`;
    return loadRemote(fullUrl, { ...this.options, httpsOnly: false });
  }
}
