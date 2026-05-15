// Browser-safe mock for Node.js 'path' module used by externalized engine modules.
// Implements posix-style path operations sufficient for the engine's import resolver.

const sep = '/';
const delimiter = ':';

function normalize(p) {
  if (!p) return '.';
  const isAbs = p.startsWith('/');
  const parts = p.split('/').reduce((acc, part) => {
    if (part === '' || part === '.') return acc;
    if (part === '..') { acc.pop(); return acc; }
    acc.push(part);
    return acc;
  }, []);
  let result = parts.join('/');
  if (isAbs) result = '/' + result;
  return result || '.';
}

function join(...args) {
  return normalize(args.filter(Boolean).join('/'));
}

function resolve(...args) {
  let resolved = '';
  for (let i = args.length - 1; i >= 0; i--) {
    const segment = args[i];
    if (segment.startsWith('/')) {
      resolved = segment + (resolved ? '/' + resolved : '');
      break;
    }
    resolved = resolved ? segment + '/' + resolved : segment;
  }
  return normalize(resolved || '.');
}

function dirname(p) {
  if (!p) return '.';
  const idx = p.lastIndexOf('/');
  if (idx === -1) return '.';
  if (idx === 0) return '/';
  return p.slice(0, idx);
}

function basename(p, ext) {
  const base = p.split('/').pop() || '';
  if (ext && base.endsWith(ext)) return base.slice(0, -ext.length);
  return base;
}

function extname(p) {
  const base = basename(p);
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx) : '';
}

function isAbsolute(p) {
  return p.startsWith('/');
}

function relative(from, to) {
  const fromParts = from.split('/').filter(Boolean);
  const toParts = to.split('/').filter(Boolean);
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
  const ups = fromParts.length - i;
  const down = toParts.slice(i);
  return [...Array(ups).fill('..'), ...down].join('/') || '.';
}

const posix = { sep, delimiter, normalize, join, resolve, dirname, basename, extname, isAbsolute, relative };

export { sep, delimiter, normalize, join, resolve, dirname, basename, extname, isAbsolute, relative, posix };
export default posix;
