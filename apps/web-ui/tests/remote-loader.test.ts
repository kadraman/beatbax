/**
 * Unit tests for RemoteLoader utilities (Phase 3)
 */

import {
  loadRemote,
  loadFromQueryParams,
  EXAMPLE_SONGS,
  RemoteLoader,
} from '../src/import/remote-loader';

// ─── fetch mock helpers ──────────────────────────────────────────────────────

function mockFetchSuccess(content: string) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => content,
  } as any);
}

function mockFetchFailure(status = 404, statusText = 'Not Found') {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    text: async () => '',
  } as any);
}

function mockFetchNetworkError(message = 'Network error') {
  global.fetch = jest.fn().mockRejectedValue(new Error(message));
}

afterEach(() => {
  jest.resetAllMocks();
});

// ─── loadRemote — basic fetch ─────────────────────────────────────────────────

describe('loadRemote — basic URL fetch', () => {
  it('returns content and filename for a successful fetch', async () => {
    mockFetchSuccess('chip gameboy\nbpm 120\nplay');

    const result = await loadRemote('/songs/sample.bax');

    expect(result.content).toBe('chip gameboy\nbpm 120\nplay');
    expect(result.filename).toBe('sample.bax');
    expect(result.url).toBe('/songs/sample.bax');
  });

  it('throws on a non-OK HTTP response', async () => {
    mockFetchFailure(404, 'Not Found');
    await expect(loadRemote('/songs/missing.bax')).rejects.toThrow('HTTP 404');
  });

  it('throws a timeout error when the request aborts', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError);

    await expect(loadRemote('/songs/slow.bax', { timeout: 100 })).rejects.toThrow(
      /timed out/i
    );
  });

  it('re-throws network errors unchanged', async () => {
    mockFetchNetworkError('net::ERR_CONNECTION_REFUSED');
    await expect(loadRemote('/songs/bad.bax')).rejects.toThrow('net::ERR_CONNECTION_REFUSED');
  });
});

// ─── loadRemote — HTTPS-only mode ────────────────────────────────────────────

describe('loadRemote — httpsOnly', () => {
  it('rejects plain HTTP URLs when httpsOnly is true', async () => {
    await expect(
      loadRemote('http://example.com/song.bax', { httpsOnly: true })
    ).rejects.toThrow(/only HTTPS/i);
  });

  it('allows HTTPS URLs when httpsOnly is true', async () => {
    mockFetchSuccess('bpm 120');
    const result = await loadRemote('https://example.com/song.bax', { httpsOnly: true });
    expect(result.content).toBe('bpm 120');
  });

  it('allows plain HTTP when httpsOnly is false (default)', async () => {
    mockFetchSuccess('bpm 120');
    const result = await loadRemote('http://example.com/song.bax');
    expect(result.content).toBe('bpm 120');
  });
});

// ─── loadRemote — GitHub URL resolution ──────────────────────────────────────

describe('loadRemote — GitHub URL resolution', () => {
  it('rewrites a full github.com blob URL to raw.githubusercontent.com', async () => {
    mockFetchSuccess('# github song');

    const result = await loadRemote(
      'https://github.com/user/repo/blob/main/songs/demo.bax'
    );

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://raw.githubusercontent.com/user/repo/main/songs/demo.bax'
    );
    expect(result.filename).toBe('demo.bax');
  });

  it('rewrites a github: shorthand to raw.githubusercontent.com, defaulting ref to main', async () => {
    mockFetchSuccess('# shorthand');

    await loadRemote('github:user/repo/songs/track.bax');

    // "songs" is a directory, not a branch — ref defaults to "main"
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://raw.githubusercontent.com/user/repo/main/songs/track.bax'
    );
  });

  it('uses an explicit ref when the @ separator is present', async () => {
    mockFetchSuccess('# explicit ref');

    await loadRemote('github:user/repo@dev/songs/track.bax');

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://raw.githubusercontent.com/user/repo/dev/songs/track.bax'
    );
  });

  it('defaults ref to main for a single-level path (no subdirectory)', async () => {
    mockFetchSuccess('# top-level file');

    await loadRemote('github:user/repo/file.bax');

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://raw.githubusercontent.com/user/repo/main/file.bax'
    );
  });

  it('throws a clear error when @ ref is present but no file path follows', async () => {
    await expect(loadRemote('github:user/repo@main')).rejects.toThrow(
      /file path is required after the ref/i
    );
  });

  it('throws a clear error when the shorthand has fewer than 3 path segments', async () => {
    await expect(loadRemote('github:user/repo')).rejects.toThrow(
      /invalid github: shorthand/i
    );
  });

  it('does not rewrite a regular HTTPS URL', async () => {
    mockFetchSuccess('data');
    await loadRemote('https://example.com/my.bax');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://example.com/my.bax'
    );
  });
});

// ─── loadFromQueryParams ──────────────────────────────────────────────────────

describe('loadFromQueryParams', () => {
  it('returns null when the ?song param is absent', async () => {
    const params = new URLSearchParams('');
    const result = await loadFromQueryParams(params);
    expect(result).toBeNull();
  });

  it('fetches and returns content when ?song is present', async () => {
    mockFetchSuccess('bpm 100');
    const params = new URLSearchParams('song=/songs/demo.bax');
    const result = await loadFromQueryParams(params);
    expect(result?.content).toBe('bpm 100');
    expect(result?.filename).toBe('demo.bax');
  });

  it('returns null (and does not throw) when the fetch fails', async () => {
    mockFetchFailure(500, 'Server Error');
    const params = new URLSearchParams('song=/songs/bad.bax');
    const result = await loadFromQueryParams(params);
    expect(result).toBeNull();
  });
});

// ─── EXAMPLE_SONGS ───────────────────────────────────────────────────────────

describe('EXAMPLE_SONGS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(EXAMPLE_SONGS)).toBe(true);
    expect(EXAMPLE_SONGS.length).toBeGreaterThan(0);
  });

  it('every entry has a label and a path starting with /', () => {
    for (const entry of EXAMPLE_SONGS) {
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.path.startsWith('/')).toBe(true);
    }
  });

  it('all paths end with .bax', () => {
    for (const entry of EXAMPLE_SONGS) {
      expect(entry.path.endsWith('.bax')).toBe(true);
    }
  });
});

// ─── RemoteLoader class ───────────────────────────────────────────────────────

describe('RemoteLoader class', () => {
  it('load() delegates to loadRemote', async () => {
    mockFetchSuccess('bpm 160');
    const loader = new RemoteLoader();
    const result = await loader.load('/songs/test.bax');
    expect(result.content).toBe('bpm 160');
  });

  it('loadExample() prepends slash when missing', async () => {
    mockFetchSuccess('bpm 160');
    const loader = new RemoteLoader();
    await loader.loadExample('songs/ex.bax');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/songs/ex.bax');
  });

  it('loadExample() keeps leading slash when present', async () => {
    mockFetchSuccess('bpm 160');
    const loader = new RemoteLoader();
    await loader.loadExample('/songs/ex.bax');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/songs/ex.bax');
  });
});
