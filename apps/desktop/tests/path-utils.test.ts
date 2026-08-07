/** @jest-environment node */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { basenameFromPath, resolveBundledSongFile, resolveBundledSongsDir } from '../src/main/path-utils';

describe('basenameFromPath', () => {
  it('handles POSIX paths', () => {
    expect(basenameFromPath('/home/runner/music/silver_orbit.bax')).toBe('silver_orbit.bax');
  });

  it('handles Windows paths on any platform', () => {
    expect(basenameFromPath('C:\\music\\silver_orbit.bax')).toBe('silver_orbit.bax');
  });
});

describe('resolveBundledSongsDir', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-songs-'));
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('prefers process.resourcesPath/songs when packaged', () => {
    const resourcesPath = path.join(tempDir, 'Resources');
    const bundledDir = path.join(resourcesPath, 'songs');
    mkdirSync(bundledDir, { recursive: true });
    writeFileSync(path.join(bundledDir, 'sample.bax'), 'chip gameboy\n', 'utf8');

    const proc = process as NodeJS.Process & { resourcesPath?: string };
    const previous = proc.resourcesPath;
    proc.resourcesPath = resourcesPath;
    try {
      expect(resolveBundledSongsDir(path.join(tempDir, 'main'), true)).toBe(bundledDir);
    } finally {
      proc.resourcesPath = previous;
    }
  });

  it('prefers build/songs next to the desktop package in dev', () => {
    const mainDir = path.join(tempDir, 'apps', 'desktop', 'out', 'main');
    const bundledDir = path.join(tempDir, 'apps', 'desktop', 'build', 'songs');
    mkdirSync(bundledDir, { recursive: true });
    writeFileSync(path.join(bundledDir, 'sample.bax'), 'chip gameboy\n', 'utf8');

    expect(resolveBundledSongsDir(mainDir, false)).toBe(bundledDir);
  });

  it('falls back to the repo songs folder when build/songs is absent', () => {
    const mainDir = path.join(tempDir, 'apps', 'desktop', 'out', 'main');
    const repoSongs = path.join(tempDir, 'songs');
    mkdirSync(repoSongs, { recursive: true });
    writeFileSync(path.join(repoSongs, 'sample.bax'), 'chip gameboy\n', 'utf8');

    expect(resolveBundledSongsDir(mainDir, false)).toBe(repoSongs);
  });

  it('returns null when no bundled songs directory exists', () => {
    expect(resolveBundledSongsDir(path.join(tempDir, 'missing', 'main'), false)).toBeNull();
    expect(existsSync(path.join(tempDir, 'missing', 'main'))).toBe(false);
  });
});

describe('resolveBundledSongFile', () => {
  let tempDir = '';
  let songsDir = '';
  let mainDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-song-file-'));
    mainDir = path.join(tempDir, 'apps', 'desktop', 'out', 'main');
    songsDir = path.join(tempDir, 'apps', 'desktop', 'build', 'songs');
    mkdirSync(path.join(songsDir, 'gameboy'), { recursive: true });
    writeFileSync(path.join(songsDir, 'gameboy', 'a_trainers_journey.bax'), 'chip gameboy\n', 'utf8');
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves /songs/... virtual paths under the bundled songs dir', () => {
    const resolved = resolveBundledSongFile(mainDir, false, '/songs/gameboy/a_trainers_journey.bax');
    expect(resolved).toBe(path.join(songsDir, 'gameboy', 'a_trainers_journey.bax'));
  });

  it('rejects path traversal', () => {
    expect(resolveBundledSongFile(mainDir, false, '/songs/../secret.bax')).toBeNull();
    expect(resolveBundledSongFile(mainDir, false, '/songs/gameboy/../../secret.bax')).toBeNull();
  });

  it('returns null for missing files and non-songs paths', () => {
    expect(resolveBundledSongFile(mainDir, false, '/songs/gameboy/missing.bax')).toBeNull();
    expect(resolveBundledSongFile(mainDir, false, '/tmp/evil.bax')).toBeNull();
  });
});
