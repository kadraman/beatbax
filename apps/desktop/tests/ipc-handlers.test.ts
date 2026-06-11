/** @jest-environment node */

import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { assertAbsoluteFilePath, mergeRecentFiles, persistFile, toFileBuffer } from '../src/main/ipc-handlers';

jest.mock('electron', () => ({
  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
  },
  app: {
    addRecentDocument: jest.fn(),
  },
}));

const { dialog } = jest.requireMock<{ dialog: { showSaveDialog: jest.Mock } }>('electron');

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
