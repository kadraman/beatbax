import type { ImportResolverOptions } from '@beatbax/engine/song';
import { getClientProfile } from '../client-profile.js';
import { storage, StorageKey } from '../utils/local-storage.js';
import { createDesktopRemoteFetch } from './desktop-remote-fetch.js';

type DesktopElectronFs = {
  readFileSync: (targetPath: string, encoding?: string) => string;
  existsSync: (targetPath: string) => boolean;
};

type DesktopElectronRemote = {
  fetchRemoteAsset?: (request: { url: string }) => Promise<unknown>;
};

function desktopApi(): (DesktopElectronFs & DesktopElectronRemote) | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { electronAPI?: DesktopElectronFs & DesktopElectronRemote })
    .electronAPI;
}

function desktopLocalFs(): Pick<ImportResolverOptions, 'readFile' | 'fileExists'> | undefined {
  const api = desktopApi();
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
    // Spec 093: route github:/https: imports through main-process IPC (CSP stays connect-src 'self').
    // Do not force httpsOnly — the adapter rejects http:// with the Desktop message (FR-004).
    const api = desktopApi();
    if (api?.fetchRemoteAsset && !overrides.remoteOptions?.fetchFn) {
      options.remoteOptions = {
        ...overrides.remoteOptions,
        fetchFn: createDesktopRemoteFetch({ fetchRemoteAsset: api.fetchRemoteAsset }),
      };
    }
  }
  return options;
}
