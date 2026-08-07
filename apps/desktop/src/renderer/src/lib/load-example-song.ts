import { loadRemote } from '@beatbax/app-core/import/remote-loader';

export interface ExampleSongLoadResult {
  filename: string;
  content: string;
}

function decodePayloadData(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

/**
 * Load an example song for the desktop app.
 *
 * Packaged builds cannot `fetch('/songs/...')` (no static server), so prefer
 * reading from electron-builder extraResources via IPC. Fall back to loadRemote
 * for dev servers that still serve `/songs` from Vite public assets.
 */
export async function loadExampleSong(
  virtualPath: string,
  preferredLabel?: string,
): Promise<ExampleSongLoadResult> {
  const api = window.electronAPI;
  if (api?.openBundledExample) {
    try {
      const payload = await api.openBundledExample(virtualPath);
      if (payload) {
        return {
          filename: preferredLabel || payload.name,
          content: decodePayloadData(payload.data),
        };
      }
    } catch (error) {
      console.warn('Bundled example load failed; falling back to remote fetch', error);
    }
  }

  const result = await loadRemote(virtualPath);
  return {
    filename: preferredLabel || result.filename,
    content: result.content,
  };
}
