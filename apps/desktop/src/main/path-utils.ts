import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

/** Basename that handles both POSIX and Windows separators (recent files may come from any OS). */
export function basenameFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

/** Directory containing bundled example songs shipped with the desktop installer. */
export function resolveBundledSongsDir(mainDirname: string, isPackaged: boolean): string | null {
  const candidates: string[] = [];

  if (isPackaged) {
    // electron-builder extraResources → Contents/Resources (macOS) or resources/ (win/linux)
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    if (resourcesPath) {
      candidates.push(join(resourcesPath, 'songs'));
    }
    // Fallback: next to the executable (Windows/Linux layouts)
    candidates.push(join(dirname(process.execPath), 'songs'));
    candidates.push(join(dirname(process.execPath), '..', 'songs'));
  }

  candidates.push(join(mainDirname, '..', '..', 'build', 'songs'));
  candidates.push(join(mainDirname, '..', '..', '..', '..', 'songs'));

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }

  return null;
}

/**
 * Resolve a virtual example path (`/songs/gameboy/foo.bax`) to an absolute file under the
 * bundled songs directory. Returns null when missing or when the path escapes the songs root.
 */
export function resolveBundledSongFile(
  mainDirname: string,
  isPackaged: boolean,
  virtualPath: string,
): string | null {
  const songsDir = resolveBundledSongsDir(mainDirname, isPackaged);
  if (!songsDir) return null;

  const trimmed = virtualPath.trim().replace(/\\/g, '/');
  const match = trimmed.match(/^\/?songs\/(.+)$/);
  if (!match) return null;

  const relativePath = match[1];
  if (!relativePath || relativePath.split('/').some((segment) => segment === '..' || segment === '')) {
    return null;
  }

  const absolutePath = resolve(songsDir, ...relativePath.split('/'));
  const rel = relative(resolve(songsDir), absolutePath);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }

  return existsSync(absolutePath) ? absolutePath : null;
}
