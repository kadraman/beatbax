/** @jest-environment node */

import { assertAbsoluteFilePath, mergeRecentFiles } from '../src/main/ipc-handlers';

describe('ipc handlers path validation', () => {
  it('accepts absolute normalized paths', () => {
    expect(assertAbsoluteFilePath('/tmp/song.bax')).toBe('/tmp/song.bax');
  });

  it('rejects relative paths', () => {
    expect(() => assertAbsoluteFilePath('../song.bax')).toThrow('Expected an absolute file path.');
  });

  it('deduplicates and prepends recent files', () => {
    expect(mergeRecentFiles(['/tmp/older.bax', '/tmp/song.bax'], '/tmp/song.bax')).toEqual([
      '/tmp/song.bax',
      '/tmp/older.bax',
    ]);
  });
});
