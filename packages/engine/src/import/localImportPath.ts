/**
 * Browser-safe path helpers for resolving `local:` instrument imports.
 * Does not import Node `fs` / `path`.
 */

import { extractLocalPath, isLocalImport, isRemoteImport } from './urlUtils.js';

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function isAbsoluteLocalPath(p: string): boolean {
  const n = toPosixPath(p);
  return n.startsWith('/') || /^[a-zA-Z]:/.test(n);
}

export function dirnameLocalPath(p: string): string {
  const n = toPosixPath(p);
  const idx = n.lastIndexOf('/');
  if (idx < 0) return '.';
  if (idx === 0) return '/';
  return n.slice(0, idx);
}

export function joinLocalPath(base: string, rel: string): string {
  const b = toPosixPath(base).replace(/\/+$/, '');
  const r = toPosixPath(rel).replace(/^\/+/, '');
  if (!b) return r;
  if (!r) return b;
  return `${b}/${r}`;
}

export function relativeLocalPath(from: string, to: string): string {
  const fromParts = splitAbs(from);
  const toParts = splitAbs(to);
  if (fromParts.root !== toParts.root) {
    return toPosixPath(to);
  }
  const a = fromParts.parts;
  const b = toParts.parts;
  let i = 0;
  const max = Math.min(a.length, b.length);
  while (i < max && equalSeg(a[i], b[i], fromParts.caseInsensitive)) i += 1;
  const ups = a.length - i;
  const down = b.slice(i);
  if (ups === 0 && down.length === 0) return '.';
  return [...Array(ups).fill('..'), ...down].join('/');
}

function equalSeg(a: string, b: string, caseInsensitive: boolean): boolean {
  return caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function splitAbs(p: string): { root: string; parts: string[]; caseInsensitive: boolean } {
  const n = toPosixPath(p);
  const drive = n.match(/^([a-zA-Z]:)(\/|$)/);
  if (drive) {
    const rest = n.slice(drive[1].length).replace(/^\/+/, '');
    return {
      root: drive[1].toLowerCase(),
      parts: rest ? rest.split('/').filter(Boolean) : [],
      caseInsensitive: true,
    };
  }
  if (n.startsWith('/')) {
    return {
      root: '/',
      parts: n.split('/').filter(Boolean),
      caseInsensitive: false,
    };
  }
  return {
    root: '',
    parts: n.split('/').filter(Boolean),
    caseInsensitive: false,
  };
}

/**
 * Validate a local import source. Returns the path after the `local:` prefix.
 */
export function validateLocalImportSource(
  importSource: string,
  allowAbsolutePaths: boolean = false,
): string {
  if (isRemoteImport(importSource)) {
    return importSource;
  }

  if (!isLocalImport(importSource)) {
    throw new Error(
      `Invalid import path "${importSource}": local file imports must use "local:" prefix. ` +
      `Use "local:${importSource}" instead. Remote imports should use "https://" or "github:" prefix.`
    );
  }

  const actualPath = extractLocalPath(importSource);
  const normalized = toPosixPath(actualPath);

  if (/(^|\/)\.\.($|\/)/.test(normalized)) {
    throw new Error(
      `Invalid import path "${importSource}": path traversal using ".." is not allowed for security reasons`
    );
  }

  if (!allowAbsolutePaths) {
    if (normalized.startsWith('/')) {
      throw new Error(
        `Invalid import path "${importSource}": absolute paths are not allowed for security reasons`
      );
    }
    if (/^[a-zA-Z]:/.test(normalized)) {
      throw new Error(
        `Invalid import path "${importSource}": absolute paths are not allowed for security reasons`
      );
    }
  }

  return actualPath;
}

function assertResolvedWithinAllowed(
  resolvedPath: string,
  allowedDirs: string[],
  importSource: string,
): void {
  if (allowedDirs.length === 0) return;

  const normalizedResolved = toPosixPath(resolvedPath);
  for (const allowedDir of allowedDirs) {
    const relative = relativeLocalPath(allowedDir, normalizedResolved);
    if (!relative.startsWith('..') && !isAbsoluteLocalPath(relative)) {
      return;
    }
  }

  throw new Error(
    `Security violation: import path "${importSource}" resolves to "${resolvedPath}" ` +
    `which is outside the allowed directories`
  );
}

export interface ResolveLocalImportOptions {
  baseFilePath?: string;
  searchPaths?: string[];
  allowAbsolutePaths?: boolean;
  fileExists: (filePath: string) => boolean;
}

/**
 * Resolve `local:…` to an absolute filesystem path, or null if the file is missing.
 */
export function resolveLocalImportPath(
  importSource: string,
  options: ResolveLocalImportOptions,
): string | null {
  const actualPath = validateLocalImportSource(importSource, options.allowAbsolutePaths || false);
  const posixRel = toPosixPath(actualPath);

  const allowedDirs: string[] = [];
  if (options.baseFilePath) {
    allowedDirs.push(dirnameLocalPath(options.baseFilePath));
  }
  for (const searchPath of options.searchPaths || []) {
    allowedDirs.push(toPosixPath(searchPath));
  }

  const candidates: string[] = [];
  if (options.baseFilePath) {
    candidates.push(joinLocalPath(dirnameLocalPath(options.baseFilePath), posixRel));
  }
  for (const searchPath of options.searchPaths || []) {
    candidates.push(joinLocalPath(searchPath, posixRel));
  }

  for (const resolved of candidates) {
    assertResolvedWithinAllowed(resolved, allowedDirs, importSource);
    if (options.fileExists(resolved)) {
      return resolved;
    }
  }

  return null;
}
