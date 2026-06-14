import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Basename that handles both POSIX and Windows separators (recent files may come from any OS). */
export function basenameFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

/** Directory containing bundled example songs shipped with the desktop installer. */
export function resolveBundledSongsDir(mainDirname: string, isPackaged: boolean): string | null {
  const candidates: string[] = [];

  if (isPackaged) {
    candidates.push(join(dirname(process.execPath), 'songs'));
  }

  candidates.push(join(mainDirname, '..', '..', 'build', 'songs'));
  candidates.push(join(mainDirname, '..', '..', '..', '..', 'songs'));

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }

  return null;
}
