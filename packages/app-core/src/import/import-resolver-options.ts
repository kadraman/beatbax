import type { ImportResolverOptions } from '@beatbax/engine/song';
import { getClientProfile } from '../client-profile.js';
import { storage, StorageKey } from '../utils/local-storage.js';

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
  }
  return options;
}
