import type { ImportResolverOptions } from '@beatbax/engine/song';
import { getClientProfile } from '../client-profile.js';
import { storage, StorageKey } from '../utils/local-storage.js';

type DesktopElectronFs = {
  readFileSync: (targetPath: string, encoding?: string) => string;
  existsSync: (targetPath: string) => boolean;
};

function desktopLocalFs(): Pick<ImportResolverOptions, 'readFile' | 'fileExists'> | undefined {
  if (typeof window === 'undefined') return undefined;
  const api = (window as unknown as { electronAPI?: DesktopElectronFs }).electronAPI;
  if (!api?.readFileSync || !api?.existsSync) return undefined;
  return {
    readFile: (filePath: string) => api.readFileSync(filePath, 'utf-8'),
    fileExists: (filePath: string) => Boolean(api.existsSync(filePath)),
  };
}

/** Build import resolver options, including the on-disk song path on desktop. */
export function buildImportResolverOptions(
  overrides: ImportResolverOptions = {},
): ImportResolverOptions {
  const options: ImportResolverOptions = { ...overrides };
  if (getClientProfile() === 'desktop-full') {
    const baseFilePath = storage.get(StorageKey.LAST_DOCUMENT_PATH);
    if (baseFilePath) {
      options.baseFilePath = baseFilePath;
    }
    const fs = desktopLocalFs();
    if (fs) {
      options.readFile = options.readFile ?? fs.readFile;
      options.fileExists = options.fileExists ?? fs.fileExists;
    }
  }
  return options;
}
