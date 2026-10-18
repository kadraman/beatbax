import { buildImportResolverOptions } from '../src/import/import-resolver-options';
import { DESKTOP_HTTPS_ONLY_MESSAGE } from '../src/import/desktop-remote-fetch';
import { storage, StorageKey } from '../src/utils/local-storage';

const mockGetClientProfile = jest.fn(() => 'desktop-full');

jest.mock('../src/client-profile.js', () => ({
  getClientProfile: () => mockGetClientProfile(),
}));

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

describe('buildImportResolverOptions (desktop)', () => {
  const originalElectron = (window as unknown as { electronAPI?: unknown }).electronAPI;

  afterEach(() => {
    storage.remove(StorageKey.LAST_DOCUMENT_PATH);
    mockGetClientProfile.mockReturnValue('desktop-full');
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

  test('sets remoteOptions.fetchFn when fetchRemoteAsset is available', async () => {
    const body = 'inst remote_lead type=pulse1 duty=50\n';
    const fetchRemoteAsset = jest.fn().mockResolvedValue(utf8(body));
    (window as unknown as { electronAPI: unknown }).electronAPI = { fetchRemoteAsset };

    const options = buildImportResolverOptions();
    expect(options.remoteOptions?.fetchFn).toEqual(expect.any(Function));
    expect(options.remoteOptions?.httpsOnly).toBeUndefined();

    const res = await options.remoteOptions!.fetchFn!(
      'https://raw.githubusercontent.com/kadraman/beatbax-instruments/main/melodic.ins',
    );
    expect(await res.text()).toBe(body);
    expect(fetchRemoteAsset).toHaveBeenCalledTimes(1);
  });

  test('does not set fetchFn on web-lite', () => {
    mockGetClientProfile.mockReturnValue('web-lite');
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      fetchRemoteAsset: jest.fn(),
    };

    const options = buildImportResolverOptions();
    expect(options.remoteOptions?.fetchFn).toBeUndefined();
  });

  test('caller-supplied remoteOptions.fetchFn wins', async () => {
    const bridge = jest.fn();
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      fetchRemoteAsset: bridge,
    };
    const custom = jest.fn(async () => ({
      ok: true,
      text: async () => 'inst custom type=pulse1\n',
      headers: { get: () => null },
    })) as unknown as typeof fetch;

    const options = buildImportResolverOptions({
      remoteOptions: { fetchFn: custom },
    });
    expect(options.remoteOptions?.fetchFn).toBe(custom);
    await options.remoteOptions!.fetchFn!('https://example.com/kit.ins');
    expect(custom).toHaveBeenCalled();
    expect(bridge).not.toHaveBeenCalled();
  });
});

describe('buildImportResolverOptions remote fetchFn (engine RemoteInstrumentCache)', () => {
  const originalElectron = (window as unknown as { electronAPI?: unknown }).electronAPI;

  beforeEach(() => {
    mockGetClientProfile.mockReturnValue('desktop-full');
  });

  afterEach(() => {
    if (originalElectron === undefined) {
      delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    } else {
      (window as unknown as { electronAPI: unknown }).electronAPI = originalElectron;
    }
  });

  test('fetchFn rejects http:// with the Desktop message and no bridge call', async () => {
    const fetchRemoteAsset = jest.fn();
    (window as unknown as { electronAPI: unknown }).electronAPI = { fetchRemoteAsset };

    const options = buildImportResolverOptions();
    await expect(
      options.remoteOptions!.fetchFn!('http://example.com/kits/lead.ins'),
    ).rejects.toThrow(DESKTOP_HTTPS_ONLY_MESSAGE);
    expect(fetchRemoteAsset).not.toHaveBeenCalled();
  });

  test('fetchFn passes allowlist errors from the bridge through unchanged', async () => {
    const message =
      "Remote asset host 'example.com' is not in the Desktop allowlist. " +
      'Add it under Settings → Advanced → Remote host allowlist.';
    const fetchRemoteAsset = jest.fn().mockRejectedValue(new Error(message));
    (window as unknown as { electronAPI: unknown }).electronAPI = { fetchRemoteAsset };

    const options = buildImportResolverOptions();
    await expect(
      options.remoteOptions!.fetchFn!('https://example.com/kits/lead.ins'),
    ).rejects.toThrow(message);
  });

  test('fetchFn returns kit text the engine cache can read for a github: raw URL', async () => {
    const kit = 'inst remote_bass type=pulse1 duty=25 env=8,down\n';
    const fetchRemoteAsset = jest.fn().mockResolvedValue(utf8(kit));
    (window as unknown as { electronAPI: unknown }).electronAPI = { fetchRemoteAsset };

    const options = buildImportResolverOptions();
    const res = await options.remoteOptions!.fetchFn!(
      'https://raw.githubusercontent.com/kadraman/beatbax-instruments/main/melodic.ins',
    );
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe(kit);
    expect(fetchRemoteAsset).toHaveBeenCalledWith({
      url: 'https://raw.githubusercontent.com/kadraman/beatbax-instruments/main/melodic.ins',
    });
  });
});
