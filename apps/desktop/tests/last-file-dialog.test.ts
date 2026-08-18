/** @jest-environment node */

import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(),
  },
}));

const { app } = jest.requireMock<{ app: { getPath: jest.Mock } }>('electron');

describe('last file-dialog directory', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-dialog-'));
    app.getPath.mockImplementation((name: string) => {
      if (name === 'userData') return tempDir;
      return os.tmpdir();
    });
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('skips packaged macOS app Contents paths', async () => {
    const { shouldRememberDialogDirectory } = await import('../src/main/last-file-dialog');
    expect(
      shouldRememberDialogDirectory('/Applications/BeatBax.app/Contents/Resources/songs'),
    ).toBe(false);
    expect(shouldRememberDialogDirectory(path.join(tempDir, 'songs'))).toBe(true);
  });

  it('persists and reads a directory that still exists', async () => {
    const {
      rememberLastFileDialogDirectory,
      readLastFileDialogDirectory,
      lastFileDialogSettingsPath,
    } = await import('../src/main/last-file-dialog');
    const songs = path.join(tempDir, 'pack');
    mkdirSync(songs);
    const song = path.join(songs, 'hook.bax');
    writeFileSync(song, 'chip gameboy\n');

    await rememberLastFileDialogDirectory(song);

    expect(JSON.parse(readFileSync(lastFileDialogSettingsPath(), 'utf8'))).toEqual({
      version: 1,
      directory: songs,
    });
    expect(await readLastFileDialogDirectory()).toBe(songs);
  });

  it('ignores a remembered directory that was deleted', async () => {
    const { rememberLastFileDialogDirectory, readLastFileDialogDirectory } = await import(
      '../src/main/last-file-dialog'
    );
    const songs = path.join(tempDir, 'gone');
    mkdirSync(songs);
    await rememberLastFileDialogDirectory(path.join(songs, 'song.bax'));
    rmSync(songs, { recursive: true, force: true });

    expect(await readLastFileDialogDirectory()).toBeNull();
  });

  it('prefers an explicit Open path, then last folder, then fallback', async () => {
    const { rememberLastFileDialogDirectory, resolveOpenDialogDefaultPath } = await import(
      '../src/main/last-file-dialog'
    );
    const songs = path.join(tempDir, 'pack');
    mkdirSync(songs);
    await rememberLastFileDialogDirectory(path.join(songs, 'a.bax'));

    expect(await resolveOpenDialogDefaultPath('/explicit/file.bax', '/fallback')).toBe(
      '/explicit/file.bax',
    );
    expect(await resolveOpenDialogDefaultPath(undefined, '/fallback')).toBe(songs);
    expect(await resolveOpenDialogDefaultPath('', '/fallback')).toBe(songs);
  });

  it('puts a bare Save filename in the last folder', async () => {
    const { rememberLastFileDialogDirectory, resolveSaveDialogDefaultPath } = await import(
      '../src/main/last-file-dialog'
    );
    const songs = path.join(tempDir, 'pack');
    mkdirSync(songs);
    await rememberLastFileDialogDirectory(path.join(songs, 'a.bax'));

    expect(await resolveSaveDialogDefaultPath('untitled.bax')).toBe(path.join(songs, 'untitled.bax'));
    expect(await resolveSaveDialogDefaultPath(path.join(songs, 'keep.bax'))).toBe(
      path.join(songs, 'keep.bax'),
    );
  });
});
