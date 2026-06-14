/** @jest-environment node */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { basenameFromPath, resolveBundledSongsDir } from '../src/main/path-utils';

describe('basenameFromPath', () => {
  it('handles POSIX paths', () => {
    expect(basenameFromPath('/home/runner/music/duck_tales.bax')).toBe('duck_tales.bax');
  });

  it('handles Windows paths on any platform', () => {
    expect(basenameFromPath('C:\\music\\duck_tales.bax')).toBe('duck_tales.bax');
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
