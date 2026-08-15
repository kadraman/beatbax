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

export function isAbsolute(p: string): boolean {
  const n = p.replace(/\\/g, '/');
  return n.startsWith('/') || /^[a-zA-Z]:/.test(n);
}

export function relative(from: string, to: string): string {
  const fromNorm = normalize(from.replace(/\\/g, '/'));
  const toNorm = normalize(to.replace(/\\/g, '/'));
  if (isAbsolute(toNorm) && isAbsolute(fromNorm)) {
    const fromDrive = fromNorm.match(/^([a-zA-Z]:)/);
    const toDrive = toNorm.match(/^([a-zA-Z]:)/);
    if (fromDrive && toDrive && fromDrive[1].toLowerCase() !== toDrive[1].toLowerCase()) {
      return toNorm;
    }
  }
  const fromParts = fromNorm.split('/').filter((s) => s && s !== '.');
  const toParts = toNorm.split('/').filter((s) => s && s !== '.');
  let i = 0;
  const max = Math.min(fromParts.length, toParts.length);
  while (i < max && fromParts[i] === toParts[i]) i += 1;
  const ups = fromParts.length - i;
  const down = toParts.slice(i);
  if (ups === 0 && down.length === 0) return '.';
  return [...Array(ups).fill('..'), ...down].join('/');
}

export function normalize(p: string): string {
  const isAbs = isAbsolute(p);
  const raw = p.replace(/\\/g, '/');
  const drive = raw.match(/^([a-zA-Z]:)/);
  const parts = normalizeSegments(raw.split('/').filter(Boolean));
  const joined = parts.join('/');
  if (drive) return `${drive[1]}/${joined.replace(new RegExp(`^${drive[1]}/?`), '')}`.replace(/\/$/, '') || drive[1];
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
  return normalize(combined);
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
export const posix = { join, resolve, normalize, dirname, basename, extname, sep, isAbsolute, relative };

export default { join, resolve, normalize, dirname, basename, extname, sep, posix, isAbsolute, relative };
