/** @jest-environment node */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  basenameFromPath,
  ensureMacExampleSongsInDocuments,
  MAC_EXAMPLES_VERSION_STAMP,
  resolveBundledSongFile,
  resolveBundledSongsDir,
  resolveExampleSongsOpenDir,
  resolveMacExampleSongsDir,
} from '../src/main/path-utils';

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

describe('resolveExampleSongsOpenDir', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-open-'));
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns Documents/BeatBax/Examples on packaged macOS', () => {
    const documentsPath = path.join(tempDir, 'Documents');
    expect(
      resolveExampleSongsOpenDir(path.join(tempDir, 'main'), true, {
        platform: 'darwin',
        documentsPath,
      }),
    ).toBe(resolveMacExampleSongsDir(documentsPath));
  });

  it('uses bundled songs on packaged Windows', () => {
    const resourcesPath = path.join(tempDir, 'resources');
    const bundledDir = path.join(resourcesPath, 'songs');
    mkdirSync(bundledDir, { recursive: true });
    writeFileSync(path.join(bundledDir, 'sample.bax'), 'chip gameboy\n', 'utf8');

    const proc = process as NodeJS.Process & { resourcesPath?: string };
    const previous = proc.resourcesPath;
    proc.resourcesPath = resourcesPath;
    try {
      expect(
        resolveExampleSongsOpenDir(path.join(tempDir, 'main'), true, {
          platform: 'win32',
          documentsPath: path.join(tempDir, 'Documents'),
        }),
      ).toBe(bundledDir);
    } finally {
      proc.resourcesPath = previous;
    }
  });

  it('uses bundled songs in unpackaged macOS dev builds', () => {
    const mainDir = path.join(tempDir, 'apps', 'desktop', 'out', 'main');
    const bundledDir = path.join(tempDir, 'apps', 'desktop', 'build', 'songs');
    mkdirSync(bundledDir, { recursive: true });
    writeFileSync(path.join(bundledDir, 'sample.bax'), 'chip gameboy\n', 'utf8');

    expect(
      resolveExampleSongsOpenDir(mainDir, false, {
        platform: 'darwin',
        documentsPath: path.join(tempDir, 'Documents'),
      }),
    ).toBe(bundledDir);
  });
});

describe('ensureMacExampleSongsInDocuments', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-sync-'));
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  function makeBundled(name = 'sample.bax', body = 'chip gameboy\n'): string {
    const bundledDir = path.join(tempDir, 'bundled', 'songs');
    mkdirSync(path.join(bundledDir, 'gameboy'), { recursive: true });
    writeFileSync(path.join(bundledDir, 'gameboy', name), body, 'utf8');
    return bundledDir;
  }

  it('copies bundled songs when the destination is missing', () => {
    const bundledDir = makeBundled();
    const examplesDir = path.join(tempDir, 'Documents', 'BeatBax', 'Examples');

    expect(ensureMacExampleSongsInDocuments(bundledDir, examplesDir, '1.0.0')).toBe(examplesDir);
    expect(existsSync(path.join(examplesDir, 'gameboy', 'sample.bax'))).toBe(true);
    expect(readFileSync(path.join(examplesDir, MAC_EXAMPLES_VERSION_STAMP), 'utf8').trim()).toBe(
      '1.0.0',
    );
  });

  it('skips copying when the stamped version already matches', () => {
    const bundledDir = makeBundled('original.bax', 'chip gameboy\n; original\n');
    const examplesDir = path.join(tempDir, 'Documents', 'BeatBax', 'Examples');
    mkdirSync(path.join(examplesDir, 'gameboy'), { recursive: true });
    writeFileSync(path.join(examplesDir, 'gameboy', 'kept.bax'), 'chip gameboy\n; kept\n', 'utf8');
    writeFileSync(path.join(examplesDir, MAC_EXAMPLES_VERSION_STAMP), '1.0.0\n', 'utf8');

    expect(ensureMacExampleSongsInDocuments(bundledDir, examplesDir, '1.0.0')).toBe(examplesDir);
    expect(existsSync(path.join(examplesDir, 'gameboy', 'kept.bax'))).toBe(true);
    expect(existsSync(path.join(examplesDir, 'gameboy', 'original.bax'))).toBe(false);
  });

  it('refreshes the destination when the app version changes', () => {
    const bundledDir = makeBundled('updated.bax', 'chip gameboy\n; updated\n');
    const examplesDir = path.join(tempDir, 'Documents', 'BeatBax', 'Examples');
    mkdirSync(path.join(examplesDir, 'gameboy'), { recursive: true });
    writeFileSync(path.join(examplesDir, 'gameboy', 'stale.bax'), 'chip gameboy\n; stale\n', 'utf8');
    writeFileSync(path.join(examplesDir, MAC_EXAMPLES_VERSION_STAMP), '1.0.0\n', 'utf8');

    expect(ensureMacExampleSongsInDocuments(bundledDir, examplesDir, '1.1.0')).toBe(examplesDir);
    expect(existsSync(path.join(examplesDir, 'gameboy', 'updated.bax'))).toBe(true);
    expect(existsSync(path.join(examplesDir, 'gameboy', 'stale.bax'))).toBe(false);
    expect(readFileSync(path.join(examplesDir, MAC_EXAMPLES_VERSION_STAMP), 'utf8').trim()).toBe(
      '1.1.0',
    );
  });

  it('returns null when the bundled directory is missing', () => {
    const examplesDir = path.join(tempDir, 'Documents', 'BeatBax', 'Examples');
    expect(ensureMacExampleSongsInDocuments(null, examplesDir, '1.0.0')).toBeNull();
    expect(ensureMacExampleSongsInDocuments(path.join(tempDir, 'missing'), examplesDir, '1.0.0')).toBeNull();
  });
});
