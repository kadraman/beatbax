import { loadRemote, resolveExampleRemoteUrl } from '@beatbax/app-core/import/remote-loader';

export interface ExampleSongLoadResult {
  filename: string;
  content: string;
}

function decodePayloadData(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

function isDesktopRemoteExamplePath(virtualPath: string): boolean {
  return virtualPath.startsWith('github:') || virtualPath.startsWith('https://');
}

async function loadRemoteExampleViaIpc(
  virtualPath: string,
  preferredLabel?: string,
): Promise<ExampleSongLoadResult> {
  const api = window.electronAPI;
  if (!api?.fetchRemoteAsset) {
    throw new Error('Desktop remote example fetch requires electronAPI.fetchRemoteAsset.');
  }
  const url = resolveExampleRemoteUrl(virtualPath);
  const payload = await api.fetchRemoteAsset({ url });
  const content = decodePayloadData(payload);
  const filename = preferredLabel || url.split('/').pop()?.split('?')[0] || 'remote.bax';
  return { filename, content };
}

/**
 * Load an example song for the desktop app.
 *
 * Packaged builds cannot `fetch('/songs/...')` (no static server), so prefer
 * reading from electron-builder extraResources via IPC. Fall back to loadRemote
 * for relative `/songs/...` paths on the Vite dev server. Cross-origin
 * `github:` / `https:` fallbacks use main-process `fetchRemoteAsset` (spec 093)
 * so the renderer CSP is not violated.
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

  if (isDesktopRemoteExamplePath(virtualPath)) {
    return loadRemoteExampleViaIpc(virtualPath, preferredLabel);
  }

  const result = await loadRemote(virtualPath);
  return {
    filename: preferredLabel || result.filename,
    content: result.content,
  };
}
