/** @jest-environment node */

import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  assertAbsoluteFilePath,
  addRecentFileEntry,
  clearRecentFileEntries,
  existsSyncSafe,
  mergeRecentFiles,
  persistFile,
  readFileSyncSafe,
  toFileBuffer,
} from '../src/main/ipc-handlers';

jest.mock('electron', () => ({
  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
  },
  app: {
    addRecentDocument: jest.fn(),
    clearRecentDocuments: jest.fn(),
  },
}));

const { dialog, app } = jest.requireMock<{
  dialog: { showSaveDialog: jest.Mock };
  app: { addRecentDocument: jest.Mock; clearRecentDocuments: jest.Mock };
}>('electron');

describe('ipc handlers path validation', () => {
  const songPath = path.join(os.tmpdir(), 'song.bax');
  const olderPath = path.join(os.tmpdir(), 'older.bax');

  it('accepts absolute normalized paths', () => {
    expect(assertAbsoluteFilePath(songPath)).toBe(path.resolve(songPath));
  });

  it('rejects relative paths', () => {
    expect(() => assertAbsoluteFilePath('../song.bax')).toThrow('Expected an absolute file path.');
  });

  it('rejects path traversal segments', () => {
    const traversalPath = `${path.dirname(os.tmpdir())}${path.sep}..${path.sep}song.bax`;
    expect(() => assertAbsoluteFilePath(traversalPath)).toThrow('Path traversal is not allowed.');
  });

  it('deduplicates and prepends recent files', () => {
    expect(mergeRecentFiles([olderPath, songPath], songPath)).toEqual([
      path.resolve(songPath),
      path.resolve(olderPath),
    ]);
  });

  it('deduplicates recent files case-insensitively on Windows', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const upperPath = path.join(os.tmpdir(), 'SONG.bax');
    const lowerPath = path.join(os.tmpdir(), 'song.bax');

    try {
      expect(mergeRecentFiles([upperPath, olderPath], lowerPath)).toEqual([
        path.resolve(lowerPath),
        path.resolve(olderPath),
      ]);
    } finally {
      if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
    }
  });
});

describe('addRecentFileEntry', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-recent-'));
    app.addRecentDocument.mockReset();
    app.clearRecentDocuments.mockReset();
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('registers the normalized path with the OS recent-documents list', async () => {
    const recentFilesPath = path.join(tempDir, 'recent-files.json');
    const unnormalized = `${tempDir}${path.sep}.${path.sep}song.bax`;

    await addRecentFileEntry(recentFilesPath, unnormalized);

    expect(app.addRecentDocument).toHaveBeenCalledWith(path.resolve(unnormalized));
    expect(app.addRecentDocument).not.toHaveBeenCalledWith(unnormalized);
  });

  it('clears stored and OS recent documents', async () => {
    const recentFilesPath = path.join(tempDir, 'recent-files.json');
    writeFileSync(recentFilesPath, JSON.stringify([path.join(tempDir, 'song.bax')]), 'utf8');

    await clearRecentFileEntries(recentFilesPath);

    expect(JSON.parse(readFileSync(recentFilesPath, 'utf8'))).toEqual([]);
    expect(app.clearRecentDocuments).toHaveBeenCalledTimes(1);
  });
});

describe('toFileBuffer', () => {
  it('accepts Uint8Array payloads', () => {
    expect(toFileBuffer(new Uint8Array([65, 66])).toString('utf8')).toBe('AB');
  });

  it('accepts plain numeric arrays from IPC serialization', () => {
    expect(toFileBuffer([65, 66]).toString('utf8')).toBe('AB');
  });
});

describe('persistFile', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-save-'));
    dialog.showSaveDialog.mockReset();
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes without dialog when showDialog is false and path is absolute', async () => {
    const target = path.join(tempDir, 'song.bax');
    const content = Buffer.from('chip gameboy\n');

    const savedPath = await persistFile({} as never, { defaultPath: target, showDialog: false }, content);

    expect(savedPath).toBe(path.resolve(target));
    expect(readFileSync(target, 'utf8')).toBe('chip gameboy\n');
    expect(dialog.showSaveDialog).not.toHaveBeenCalled();
  });
});

describe('desktop sync file reads', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-read-'));
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads text files with path validation', () => {
    const target = path.join(tempDir, 'foo.ins');
    writeFileSync(target, 'inst foo\n', 'utf8');

    expect(readFileSyncSafe(target, 'utf-8')).toBe('inst foo\n');
  });

  it('reports file existence with path validation', () => {
    const target = path.join(tempDir, 'foo.ins');
    writeFileSync(target, 'inst foo\n', 'utf8');

    expect(existsSyncSafe(path.join(tempDir, 'missing.ins'))).toBe(false);
    expect(existsSyncSafe(target)).toBe(true);
  });
});
