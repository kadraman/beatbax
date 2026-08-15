import { buildImportResolverOptions } from '../src/import/import-resolver-options';
import { storage, StorageKey } from '../src/utils/local-storage';

jest.mock('../src/client-profile.js', () => ({
  getClientProfile: () => 'desktop-full',
}));

describe('buildImportResolverOptions (desktop)', () => {
  const originalElectron = (window as unknown as { electronAPI?: unknown }).electronAPI;

  afterEach(() => {
    storage.remove(StorageKey.LAST_DOCUMENT_PATH);
    if (originalElectron === undefined) {
      delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    } else {
      (window as unknown as { electronAPI: unknown }).electronAPI = originalElectron;
    }
  });

  test('injects baseFilePath and Electron fs callbacks', () => {
    storage.set(StorageKey.LAST_DOCUMENT_PATH, 'C:\\music\\song.bax');
    const existsSync = jest.fn().mockReturnValue(true);
    const readFileSync = jest.fn().mockReturnValue('inst lead type=pulse1');
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      readFileSync,
      existsSync,
    };

    const options = buildImportResolverOptions();
    expect(options.baseFilePath).toBe('C:\\music\\song.bax');
    expect(options.readFile?.('C:/music/lib/adventure.ins')).toBe('inst lead type=pulse1');
    expect(options.fileExists?.('C:/music/lib/adventure.ins')).toBe(true);
    expect(readFileSync).toHaveBeenCalledWith('C:/music/lib/adventure.ins', 'utf-8');
    expect(existsSync).toHaveBeenCalledWith('C:/music/lib/adventure.ins');
  });
});
