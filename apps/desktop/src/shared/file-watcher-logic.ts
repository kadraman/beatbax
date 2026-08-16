/** Pure helpers for the main-process document watcher (unit-tested without fs.watch). */

function defaultPlatform(): NodeJS.Platform {
  if (typeof process !== 'undefined' && process.platform) return process.platform;
  if (typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)) return 'win32';
  if (typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)) return 'darwin';
  return 'linux';
}

/** Fold slashes and Windows long-path prefixes so IPC and Node paths compare equal. */
export function normalizePathForMatch(
  filePath: string,
  platform: NodeJS.Platform = defaultPlatform(),
): string {
  let normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('//?/') || normalized.startsWith('//./')) {
    normalized = normalized.slice(4);
  }
  if (platform === 'win32') normalized = normalized.toLowerCase();
  return normalized;
}

export function fileNamesMatch(
  a: string,
  b: string,
  platform: NodeJS.Platform = defaultPlatform(),
): boolean {
  if (platform === 'win32') return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

export function filePathsMatch(
  a: string,
  b: string,
  platform: NodeJS.Platform = defaultPlatform(),
): boolean {
  return normalizePathForMatch(a, platform) === normalizePathForMatch(b, platform);
}

/** When `filename` is omitted, treat the event as possibly about the watched file. */
export function shouldHandleDirectoryWatchEvent(
  watchedBasename: string,
  eventFilename: string | null | undefined,
  platform: NodeJS.Platform = defaultPlatform(),
): boolean {
  if (!eventFilename) return true;
  const base = eventFilename.split(/[/\\]/).pop() || eventFilename;
  return fileNamesMatch(base, watchedBasename, platform);
}

export function isSelfWriteEcho(options: {
  watchedPath: string;
  eventPath: string;
  nowMs: number;
  ignoreUntilMs: number;
  lastWriteMtimeMs?: number;
  eventMtimeMs?: number;
  platform?: NodeJS.Platform;
}): boolean {
  const platform = options.platform ?? defaultPlatform();
  if (!filePathsMatch(options.watchedPath, options.eventPath, platform)) return false;
  if (options.nowMs < options.ignoreUntilMs) return true;
  if (
    options.lastWriteMtimeMs !== undefined
    && options.eventMtimeMs !== undefined
    && Math.abs(options.eventMtimeMs - options.lastWriteMtimeMs) < 2
  ) {
    return true;
  }
  return false;
}
