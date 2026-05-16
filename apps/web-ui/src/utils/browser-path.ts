/**
 * Minimal POSIX path helpers for browser bundles.
 * Aliased as Node "path" at build time when engine modules reference path.
 */

function normalizeSegments(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out;
}

export function normalize(p: string): string {
  const isAbs = p.startsWith('/');
  const parts = normalizeSegments(p.split('/').filter(Boolean));
  const joined = parts.join('/');
  return isAbs ? `/${joined}` : joined || '.';
}

export function join(...segments: string[]): string {
  const combined = segments
    .filter((s) => s != null && s !== '')
    .join('/')
    .replace(/\\/g, '/');
  return normalize(combined);
}

export function resolve(...segments: string[]): string {
  const combined = segments.join('/').replace(/\\/g, '/');
  const isAbs = combined.startsWith('/');
  const parts = normalizeSegments(combined.split('/').filter(Boolean));
  const joined = parts.join('/');
  return isAbs ? `/${joined}` : joined || '.';
}

export function dirname(p: string): string {
  const norm = p.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  if (idx <= 0) return norm.startsWith('/') ? '/' : '.';
  return norm.slice(0, idx) || '/';
}

export function basename(p: string, ext?: string): string {
  const norm = p.replace(/\\/g, '/');
  const base = norm.slice(norm.lastIndexOf('/') + 1);
  if (ext && base.endsWith(ext)) return base.slice(0, -ext.length);
  return base;
}

export function extname(p: string): string {
  const base = basename(p);
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx) : '';
}

export const sep = '/';
export const posix = { join, resolve, normalize, dirname, basename, extname, sep };

export default { join, resolve, normalize, dirname, basename, extname, sep, posix };
