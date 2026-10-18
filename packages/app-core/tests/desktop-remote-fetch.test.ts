import {
  createDesktopRemoteFetch,
  DESKTOP_HTTPS_ONLY_MESSAGE,
  remoteAssetPayloadToBytes,
} from '../src/import/desktop-remote-fetch';

function utf8(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function ensureResponse(): void {
  if (typeof Response !== 'undefined') return;
  (globalThis as unknown as { Response: unknown }).Response = class {
    private readonly body: ArrayBuffer;
    readonly status: number;
    readonly headers = { get: (_name: string) => null as string | null };
    constructor(body: ArrayBuffer, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    get ok(): boolean {
      return this.status >= 200 && this.status < 300;
    }
    async text(): Promise<string> {
      return String.fromCharCode(...new Uint8Array(this.body));
    }
  };
}

beforeAll(() => {
  ensureResponse();
});

describe('remoteAssetPayloadToBytes', () => {
  test('accepts Uint8Array, ArrayBuffer, number arrays, and Buffer-shaped payloads', () => {
    expect(Array.from(remoteAssetPayloadToBytes(new Uint8Array([1, 2])))).toEqual([1, 2]);
    expect(Array.from(remoteAssetPayloadToBytes(new Uint8Array([3, 4]).buffer))).toEqual([3, 4]);
    expect(Array.from(remoteAssetPayloadToBytes([5, 6]))).toEqual([5, 6]);
    expect(
      Array.from(remoteAssetPayloadToBytes({ type: 'Buffer', data: [7, 8] })),
    ).toEqual([7, 8]);
  });

  test('rejects unknown shapes', () => {
    expect(() => remoteAssetPayloadToBytes({ foo: 1 })).toThrow(/invalid remote asset payload/i);
  });
});

describe('createDesktopRemoteFetch', () => {
  test('returns Response text from bridge bytes', async () => {
    const body = 'inst lead type=pulse1 duty=50\n';
    const fetchRemoteAsset = jest.fn().mockResolvedValue(utf8(body));
    const fetchFn = createDesktopRemoteFetch({ fetchRemoteAsset });

    const res = await fetchFn('https://raw.githubusercontent.com/user/repo/main/kit.ins');
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe(body);
    expect(fetchRemoteAsset).toHaveBeenCalledWith({
      url: 'https://raw.githubusercontent.com/user/repo/main/kit.ins',
    });
  });

  test('passes policy errors through unchanged', async () => {
    const message =
      "Remote asset host 'example.com' is not in the Desktop allowlist. " +
      'Add it under Settings → Advanced → Remote host allowlist.';
    const fetchRemoteAsset = jest.fn().mockRejectedValue(new Error(message));
    const fetchFn = createDesktopRemoteFetch({ fetchRemoteAsset });

    await expect(fetchFn('https://example.com/kit.ins')).rejects.toThrow(message);
  });

  test('decodes Buffer-shaped IPC payloads', async () => {
    const fetchRemoteAsset = jest.fn().mockResolvedValue({
      type: 'Buffer',
      data: Array.from(utf8('inst x type=pulse1\n')),
    });
    const fetchFn = createDesktopRemoteFetch({ fetchRemoteAsset });
    expect(await (await fetchFn('https://raw.githubusercontent.com/a/b/main/x.ins')).text()).toBe(
      'inst x type=pulse1\n',
    );
  });

  test('rejects http:// before calling the bridge', async () => {
    const fetchRemoteAsset = jest.fn();
    const fetchFn = createDesktopRemoteFetch({ fetchRemoteAsset });

    await expect(fetchFn('http://example.com/kit.ins')).rejects.toThrow(DESKTOP_HTTPS_ONLY_MESSAGE);
    expect(fetchRemoteAsset).not.toHaveBeenCalled();
  });

  test('honours an already-aborted signal', async () => {
    const fetchRemoteAsset = jest.fn();
    const fetchFn = createDesktopRemoteFetch({ fetchRemoteAsset });
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchFn('https://raw.githubusercontent.com/a/b/main/x.ins', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchRemoteAsset).not.toHaveBeenCalled();
  });

  test('rejects with AbortError when the signal aborts before the bridge resolves', async () => {
    let resolveBridge!: (value: Uint8Array) => void;
    const fetchRemoteAsset = jest.fn(
      () =>
        new Promise<Uint8Array>((resolve) => {
          resolveBridge = resolve;
        }),
    );
    const fetchFn = createDesktopRemoteFetch({ fetchRemoteAsset });
    const controller = new AbortController();

    const pending = fetchFn('https://raw.githubusercontent.com/a/b/main/x.ins', {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    resolveBridge(new Uint8Array([1]));
  });
});
