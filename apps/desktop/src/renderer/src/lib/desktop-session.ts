import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';

export interface PersistedDocument {
  path: string | null;
  name: string;
}

function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

/** Persist the last known on-disk document location for session restore. */
export function persistDocumentSession(path: string | null, name: string): void {
  storage.set(StorageKey.LOADED_FILENAME, name);
  if (path) {
    storage.set(StorageKey.LAST_DOCUMENT_PATH, path);
  } else {
    storage.remove(StorageKey.LAST_DOCUMENT_PATH);
  }
}

/** Read the last document path/name saved by the desktop app. */
export function readPersistedDocument(): PersistedDocument {
  const path = storage.get(StorageKey.LAST_DOCUMENT_PATH);
  const storedName = storage.get(StorageKey.LOADED_FILENAME);

  if (path) {
    return {
      path,
      name: storedName || basename(path),
    };
  }

  return {
    path: null,
    name: storedName || 'untitled.bax',
  };
}
