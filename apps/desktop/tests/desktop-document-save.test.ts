/** @jest-environment jsdom */

import { TextEncoder } from 'node:util';
import { autoSaveDocumentToDisk, isAbsoluteFilePath, saveDocumentToDisk } from '../src/renderer/src/lib/desktop-document-save';

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
}

describe('desktop-document-save', () => {
  const api = {
    saveFile: jest.fn(),
  };

  beforeEach(() => {
    api.saveFile.mockReset();
    api.saveFile.mockResolvedValue('C:\\music\\song.bax');
  });

  it('detects absolute Windows and POSIX paths', () => {
    expect(isAbsoluteFilePath('C:\\music\\song.bax')).toBe(true);
    expect(isAbsoluteFilePath('/home/user/song.bax')).toBe(true);
    expect(isAbsoluteFilePath('song.bax')).toBe(false);
  });

  it('uses silent save when a document path is already known', async () => {
    await saveDocumentToDisk(
      api as never,
      'chip gameboy',
      { path: 'C:\\music\\song.bax', name: 'song.bax' },
      false,
    );

    expect(api.saveFile).toHaveBeenCalledWith(
      { defaultPath: 'C:\\music\\song.bax', showDialog: false },
      expect.any(Uint8Array),
    );
  });

  it('opens the save dialog for untitled documents', async () => {
    await saveDocumentToDisk(
      api as never,
      'chip gameboy',
      { path: null, name: 'untitled.bax' },
      false,
    );

    expect(api.saveFile).toHaveBeenCalledWith(
      { defaultPath: 'untitled.bax', showDialog: true },
      expect.any(Uint8Array),
    );
  });

  it('auto-saves only when the path is absolute', async () => {
    await expect(autoSaveDocumentToDisk(api as never, 'chip gameboy', 'song.bax')).resolves.toBe(false);
    expect(api.saveFile).not.toHaveBeenCalled();

    await expect(autoSaveDocumentToDisk(api as never, 'chip gameboy', 'C:\\music\\song.bax')).resolves.toBe(true);
    expect(api.saveFile).toHaveBeenCalledWith(
      { defaultPath: 'C:\\music\\song.bax', showDialog: false },
      expect.any(Uint8Array),
    );
  });
});
