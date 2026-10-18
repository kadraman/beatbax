/**
 * Desktop adapter: main-process `fetchRemoteAsset` → `fetch`-compatible Response.
 * Spec 093 — keep renderer CSP `connect-src 'self'`; never call global fetch for remotes.
 */

export const DESKTOP_HTTPS_ONLY_MESSAGE =
  'Only https:// remote assets are allowed in Desktop.';

export type DesktopRemoteFetchApi = {
  fetchRemoteAsset: (request: { url: string }) => Promise<unknown>;
};

/** Convert IPC payloads (Uint8Array, ArrayBuffer, number[], Node Buffer shape) to bytes. */
export function remoteAssetPayloadToBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(data);
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (record.type === 'Buffer' && Array.isArray(record.data)) {
      return new Uint8Array(record.data as number[]);
    }
  }
  throw new Error('Desktop remote import: invalid remote asset payload from main process.');
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function abortError(): Error {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

/**
 * Returns a `fetch`-compatible function that loads HTTPS URLs through the Desktop
 * main-process bridge. Non-https URLs are rejected before any IPC call.
 */
export function createDesktopRemoteFetch(api: DesktopRemoteFetchApi): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Remote asset URL is invalid.');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error(DESKTOP_HTTPS_ONLY_MESSAGE);
    }

    const signal = init?.signal;
    if (signal?.aborted) {
      throw abortError();
    }

    let onAbort: (() => void) | undefined;
    const aborted = signal
      ? new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(abortError());
          signal.addEventListener('abort', onAbort, { once: true });
        })
      : null;

    try {
      const payload = aborted
        ? await Promise.race([api.fetchRemoteAsset({ url }), aborted])
        : await api.fetchRemoteAsset({ url });
      const bytes = remoteAssetPayloadToBytes(payload);
      // Copy into a plain ArrayBuffer so Response accepts the body under DOM lib typings.
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return new Response(copy.buffer, { status: 200 });
    } finally {
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }) as typeof fetch;
}
