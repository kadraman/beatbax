import type { ElectronAPI } from '../../../shared/electron-api';

export interface OpenDocumentRef {
  path: string | null;
  name: string;
}

/** True when the path is safe for silent (no-dialog) writes on the main process. */
export function isAbsoluteFilePath(filePath: string): boolean {
  if (filePath.startsWith('/')) return true;
  if (filePath.startsWith('\\\\')) return true;
  return /^[A-Za-z]:[\\/]/.test(filePath);
}

export function encodeDocumentContent(content: string): Uint8Array {
  const encoded = new TextEncoder().encode(content);
  return encoded instanceof Uint8Array ? encoded : Uint8Array.from(encoded);
}

export async function saveDocumentToDisk(
  api: ElectronAPI,
  content: string,
  doc: OpenDocumentRef,
  saveAs = false,
): Promise<string | null> {
  const defaultPath = doc.path ?? doc.name;
  const canSilentSave = !saveAs && doc.path !== null && isAbsoluteFilePath(doc.path);

  return api.saveFile(
    {
      defaultPath,
      showDialog: saveAs || !canSilentSave,
    },
    encodeDocumentContent(content),
  );
}

export async function autoSaveDocumentToDisk(
  api: ElectronAPI,
  content: string,
  filePath: string,
): Promise<boolean> {
  if (!isAbsoluteFilePath(filePath)) return false;
  const saved = await api.saveFile(
    { defaultPath: filePath, showDialog: false },
    encodeDocumentContent(content),
  );
  return saved !== null;
}
