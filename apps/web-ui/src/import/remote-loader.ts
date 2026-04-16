/**
 * Remote loader - Load .bax files from URLs
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

const DEFAULT_GITHUB_REF = 'main';

/**
 * Convert a GitHub URL to a raw content URL.
 *
 * Handles:
 * - `https://github.com/user/repo/blob/branch/path`
 * - `github:user/repo/path/to/file.bax`           — ref defaults to "main"
 * - `github:user/repo@branch/path/to/file.bax`    — explicit ref via `@`
 *
 * The `@` separator unambiguously marks the ref so that paths containing
 * directory components (e.g. `songs/demo.bax`) are never misread as branches.
 */
function resolveGitHubUrl(url: string): string | null {
  // github: shorthand
  if (url.startsWith('github:')) {
    const spec = url.slice(7); // everything after "github:"

    const atIdx = spec.indexOf('@');
    if (atIdx !== -1) {
      // Explicit ref: github:user/repo@ref/path/to/file.bax
      const repoPart = spec.slice(0, atIdx);          // "user/repo"
      const rest = spec.slice(atIdx + 1);             // "ref/path/to/file.bax"
      const slashIdx = rest.indexOf('/');
      if (slashIdx === -1) {
        throw new Error(
          `Invalid github: shorthand "${url}" — a file path is required after the ref ` +
          `(e.g. github:${repoPart}@${rest}/file.bax)`
        );
      }
      const ref = rest.slice(0, slashIdx);
      const filePath = rest.slice(slashIdx + 1);
      return `https://raw.githubusercontent.com/${repoPart}/${ref}/${filePath}`;
    }

    // No explicit ref — split user/repo off and default the ref to "main"
    const parts = spec.split('/');
    if (parts.length < 3) {
      throw new Error(
        `Invalid github: shorthand "${url}" — expected github:user/repo/path/to/file.bax ` +
        `or github:user/repo@ref/path/to/file.bax`
      );
    }
    const [user, repo, ...pathParts] = parts;
    const filePath = pathParts.join('/');
    return `https://raw.githubusercontent.com/${user}/${repo}/${DEFAULT_GITHUB_REF}/${filePath}`;
  }

  // Full GitHub URL: https://github.com/user/repo/blob/branch/path
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

/** A single song entry inside an example group. */
export interface ExampleSong {
  label: string;
  path: string;
}

/** A named group of songs, e.g. for a specific chip. */
export interface ExampleSongGroup {
  /** Display label for the group (e.g. "Game Boy", "NES"). */
  group: string;
  songs: ExampleSong[];
}

/**
 * Built-in example songs grouped by chip / category (paths served by Vite).
 */
export const EXAMPLE_SONG_GROUPS: ExampleSongGroup[] = [
  {
    group: 'Game Boy',
    songs: [
      { label: 'a_trainers_journey.bax',     path: '/songs/gameboy/a_trainers_journey.bax' },
      { label: 'crypt_of_fallen_kings.bax',  path: '/songs/gameboy/crypt_of_fallen_kings.bax' },
      { label: 'digital_citadel.bax',        path: '/songs/gameboy/digital_citadel.bax' },
      { label: 'grassland_dash.bax',         path: '/songs/gameboy/grassland_dash.bax' },
      { label: 'graveyard_shift.bax',        path: '/songs/gameboy/graveyard_shift.bax' },
      { label: 'heroes_call.bax',            path: '/songs/gameboy/heroes_call.bax' },
      { label: 'mystic_voyage.bax',          path: '/songs/gameboy/mystic_voyage.bax' },
      { label: 'night_hawk.bax',             path: '/songs/gameboy/night_hawk.bax' },
    ],
  },
  {
    group: 'NES',
    songs: [
      { label: 'iron_keep.bax',              path: '/songs/nes/iron_keep.bax' },
      { label: 'kingdom_hall.bax',           path: '/songs/nes/kingdom_hall.bax' },
      { label: 'shadow_temple.bax',          path: '/songs/nes/shadow_temple.bax' },
      { label: 'wily_fortress.bax',          path: '/songs/nes/wily_fortress.bax' },
    ],
  },
];

/**
 * Flat list of all example songs — kept for backward compatibility with code
 * that still consumes the old `EXAMPLE_SONGS` array.
 */
export const EXAMPLE_SONGS: ExampleSong[] = EXAMPLE_SONG_GROUPS.flatMap(g => g.songs);

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
