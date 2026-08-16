import {
  fileNamesMatch,
  filePathsMatch,
  isSelfWriteEcho,
  shouldHandleDirectoryWatchEvent,
} from '../src/shared/file-watcher-logic';

describe('file watcher matching', () => {
  it('matches basenames case-insensitively on Windows', () => {
    expect(fileNamesMatch('Song.bax', 'song.bax', 'win32')).toBe(true);
    expect(fileNamesMatch('Song.bax', 'song.bax', 'linux')).toBe(false);
  });

  it('matches full paths across slash styles on Windows', () => {
    expect(filePathsMatch('C:\\music\\song.bax', 'C:/music/song.bax', 'win32')).toBe(true);
    expect(filePathsMatch('\\\\?\\C:\\music\\song.bax', 'C:\\music\\song.bax', 'win32')).toBe(true);
    expect(filePathsMatch('C:\\music\\song.bax', 'C:\\music\\song.bax')).toBe(true);
  });

  it('treats omitted directory-watch filenames as a hit', () => {
    expect(shouldHandleDirectoryWatchEvent('song.bax', null, 'win32')).toBe(true);
    expect(shouldHandleDirectoryWatchEvent('song.bax', 'other.bax', 'linux')).toBe(false);
    expect(shouldHandleDirectoryWatchEvent('song.bax', 'SONG.bax', 'win32')).toBe(true);
    expect(shouldHandleDirectoryWatchEvent('song.bax', 'C:\\tmp\\song.bax', 'win32')).toBe(true);
  });
});

describe('isSelfWriteEcho', () => {
  const watchedPath = 'C:\\music\\song.bax';

  it('ignores events inside the self-write window', () => {
    expect(isSelfWriteEcho({
      watchedPath,
      eventPath: watchedPath,
      nowMs: 1_000,
      ignoreUntilMs: 1_500,
      platform: 'win32',
    })).toBe(true);
  });

  it('ignores events whose mtime matches the last BeatBax write', () => {
    expect(isSelfWriteEcho({
      watchedPath,
      eventPath: watchedPath,
      nowMs: 2_000,
      ignoreUntilMs: 500,
      lastWriteMtimeMs: 123.4,
      eventMtimeMs: 123.4,
      platform: 'win32',
    })).toBe(true);
  });

  it('does not ignore a later external write', () => {
    expect(isSelfWriteEcho({
      watchedPath,
      eventPath: watchedPath,
      nowMs: 2_000,
      ignoreUntilMs: 500,
      lastWriteMtimeMs: 100,
      eventMtimeMs: 250,
      platform: 'win32',
    })).toBe(false);
  });

  it('does not ignore a different path', () => {
    expect(isSelfWriteEcho({
      watchedPath,
      eventPath: 'C:\\music\\other.bax',
      nowMs: 1_000,
      ignoreUntilMs: 1_500,
      platform: 'win32',
    })).toBe(false);
    expect(filePathsMatch(watchedPath, 'C:\\music\\SONG.bax', 'win32')).toBe(true);
  });
});
