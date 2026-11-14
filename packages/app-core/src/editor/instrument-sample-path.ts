/**
 * Turn an absolute file chosen in Browse into a song-relative `local:` remainder.
 * Rejects a missing song path, a non-absolute pick, and any file outside the song folder.
 */

export type LocalSamplePathResult =
  | { ok: true; remainder: string }
  | { ok: false; error: string };

const UNSAVED = 'Save the song before choosing a local sample.';
const OUTSIDE = 'Choose a .dmc file inside the song folder. Paths outside the song are not allowed.';

interface AbsolutePath {
  root: string;
  parts: string[];
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function splitAbsolute(posix: string): AbsolutePath | null {
  let rest = posix;
  let root = '';
  if (rest.startsWith('//')) {
    root = '//';
    rest = rest.slice(2);
  } else if (/^[A-Za-z]:\//.test(rest)) {
    root = rest.slice(0, 2);
    rest = rest.slice(3);
  } else if (rest.startsWith('/')) {
    root = '/';
    rest = rest.slice(1);
  } else {
    return null;
  }

  const parts: string[] = [];
  for (const part of rest.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return { root, parts };
}

/** Windows drive / UNC roots compare case-insensitively; POSIX `/` segments do not. */
function caseInsensitiveRoot(root: string): boolean {
  return root !== '/';
}

function sameSegment(a: string, b: string, ignoreCase: boolean): boolean {
  return ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** Directory of a saved song, using forward slashes. */
export function songDirectory(songPath: string): string | null {
  const abs = splitAbsolute(toPosix(songPath.trim()));
  if (!abs || abs.parts.length === 0) return null;
  const dir = abs.parts.slice(0, -1);
  if (abs.root === '/') return `/${dir.join('/')}`;
  if (abs.root === '//') return `//${dir.join('/')}`;
  return `${abs.root}/${dir.join('/')}`;
}

export function localSampleRemainder(
  absoluteFile: string,
  songPath: string | null | undefined,
): LocalSamplePathResult {
  if (!songPath?.trim()) return { ok: false, error: UNSAVED };
  const song = splitAbsolute(toPosix(songPath.trim()));
  const file = splitAbsolute(toPosix(absoluteFile.trim()));
  if (!song || song.parts.length === 0) return { ok: false, error: UNSAVED };
  if (!file) return { ok: false, error: OUTSIDE };
  const ignoreCase = caseInsensitiveRoot(song.root);
  if (!sameSegment(song.root, file.root, ignoreCase)) return { ok: false, error: OUTSIDE };

  const songDir = song.parts.slice(0, -1);
  const inside = file.parts.length > songDir.length
    && songDir.every((part, index) => sameSegment(part, file.parts[index] ?? '', ignoreCase));
  if (!inside) return { ok: false, error: OUTSIDE };

  const remainder = file.parts.slice(songDir.length).join('/');
  if (!remainder || remainder.split('/').some((part) => part === '..')) {
    return { ok: false, error: OUTSIDE };
  }
  return { ok: true, remainder };
}
