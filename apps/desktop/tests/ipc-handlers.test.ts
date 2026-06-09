/** @jest-environment node */

import os from 'node:os';
import path from 'node:path';
import { assertAbsoluteFilePath, mergeRecentFiles } from '../src/main/ipc-handlers';

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
