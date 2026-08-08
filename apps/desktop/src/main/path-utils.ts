import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

/** Stamp file written into the macOS Documents examples copy after a successful sync. */
export const MAC_EXAMPLES_VERSION_STAMP = '.beatbax-examples-version';

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

/** User-visible examples folder used on packaged macOS (NSOpenPanel cannot open inside .app). */
export function resolveMacExampleSongsDir(documentsPath: string): string {
  return join(documentsPath, 'BeatBax', 'Examples');
}

/**
 * Directory File → Open should start in.
 * Packaged macOS uses ~/Documents/BeatBax/Examples; other platforms use the bundled songs dir.
 */
export function resolveExampleSongsOpenDir(
  mainDirname: string,
  isPackaged: boolean,
  options?: { platform?: NodeJS.Platform; documentsPath?: string },
): string | null {
  const platform = options?.platform ?? process.platform;
  if (platform === 'darwin' && isPackaged && options?.documentsPath) {
    return resolveMacExampleSongsDir(options.documentsPath);
  }
  return resolveBundledSongsDir(mainDirname, isPackaged);
}

/**
 * Copy bundled example songs into the macOS Documents examples folder when missing
 * or when the installed app version changed. Returns the examples dir on success, else null.
 */
export function ensureMacExampleSongsInDocuments(
  bundledDir: string | null,
  examplesDir: string,
  appVersion: string,
): string | null {
  if (!bundledDir || !existsSync(bundledDir)) {
    console.warn('[BeatBax] Bundled example songs not found; skipping Documents sync.');
    return existsSync(examplesDir) ? examplesDir : null;
  }

  const stampPath = join(examplesDir, MAC_EXAMPLES_VERSION_STAMP);
  let stampedVersion: string | null = null;
  if (existsSync(stampPath)) {
    try {
      stampedVersion = readFileSync(stampPath, 'utf8').trim();
    } catch {
      stampedVersion = null;
    }
  }

  if (existsSync(examplesDir) && stampedVersion === appVersion) {
    return examplesDir;
  }

  try {
    if (existsSync(examplesDir)) {
      rmSync(examplesDir, { recursive: true, force: true });
    }
    mkdirSync(dirname(examplesDir), { recursive: true });
    cpSync(bundledDir, examplesDir, { recursive: true });
    writeFileSync(stampPath, `${appVersion}\n`, 'utf8');
    return examplesDir;
  } catch (error) {
    console.error('[BeatBax] Failed to sync example songs to Documents:', error);
    return existsSync(examplesDir) ? examplesDir : null;
  }
}
