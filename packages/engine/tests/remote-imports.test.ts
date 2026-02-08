/**
 * Tests for remote instrument imports
 */

import { RemoteInstrumentCache } from '../src/import/remoteCache.js';
import { isRemoteImport, expandGitHubShorthand, normalizeRemoteUrl } from '../src/import/urlUtils.js';

describe('Remote Import URL Utilities', () => {
  test('detects remote imports correctly', () => {
    expect(isRemoteImport('https://example.com/file.ins')).toBe(true);
    expect(isRemoteImport('http://example.com/file.ins')).toBe(true);
    expect(isRemoteImport('github:user/repo/main/file.ins')).toBe(true);
    expect(isRemoteImport('local/file.ins')).toBe(false);
    expect(isRemoteImport('../file.ins')).toBe(false);
  });

  test('expands GitHub shorthand correctly', () => {
    expect(expandGitHubShorthand('github:user/repo/main/file.ins'))
      .toBe('https://raw.githubusercontent.com/user/repo/main/file.ins');

    expect(expandGitHubShorthand('https://example.com/file.ins'))
      .toBe('https://example.com/file.ins');
  });

  test('normalizes remote URLs', () => {
    const githubUrl = normalizeRemoteUrl('github:user/repo/main/file.ins');
    expect(githubUrl).toBe('https://raw.githubusercontent.com/user/repo/main/file.ins');

    const httpsUrl = normalizeRemoteUrl('https://example.com/file.ins');
    expect(httpsUrl).toBe('https://example.com/file.ins');
  });

  test('rejects invalid protocols', () => {
    expect(() => normalizeRemoteUrl('ftp://example.com/file.ins'))
      .toThrow(/Invalid protocol/);
  });
});

describe('RemoteInstrumentCache', () => {
  test('creates cache with default options', () => {
    const cache = new RemoteInstrumentCache();
    expect(cache).toBeDefined();
    expect(cache.getStats().size).toBe(0);
  });

  test('creates cache with custom options', () => {
    const cache = new RemoteInstrumentCache({
      timeout: 5000,
      maxFileSize: 512 * 1024,
      httpsOnly: true,
    });
    expect(cache).toBeDefined();
  });

  test('tracks cache entries', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', '100']]),
      text: async () => 'inst test type=pulse1 duty=50',
    });

    const cache = new RemoteInstrumentCache({
      fetchFn: mockFetch as any,
    });

    const url = 'https://example.com/test.ins';
    const instruments = await cache.fetch(url);

    expect(instruments.test).toBeDefined();
    expect(instruments.test.type).toBe('pulse1');
    expect(cache.has(url)).toBe(true);
    expect(cache.getStats().size).toBe(1);
  });

  test('caches fetched instruments', async () => {
    let fetchCount = 0;
    const mockFetch = jest.fn().mockImplementation(() => {
      fetchCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([['content-length', '100']]),
        text: async () => 'inst test type=pulse1 duty=50',
      });
    });

    const cache = new RemoteInstrumentCache({
      fetchFn: mockFetch as any,
    });

    const url = 'https://example.com/test.ins';

    // First fetch
    await cache.fetch(url);
    expect(fetchCount).toBe(1);

    // Second fetch should use cache
    await cache.fetch(url);
    expect(fetchCount).toBe(1); // No additional fetch

    expect(cache.getStats().size).toBe(1);
  });

  test('enforces file size limits', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', '2000000']]), // 2MB
      text: async () => 'inst test type=pulse1',
    });

    const cache = new RemoteInstrumentCache({
      fetchFn: mockFetch as any,
      maxFileSize: 1024 * 1024, // 1MB limit
    });

    const url = 'https://example.com/large.ins';

    await expect(cache.fetch(url)).rejects.toThrow(/too large/);
  });

  test('validates HTTPS-only mode', async () => {
    const cache = new RemoteInstrumentCache({
      httpsOnly: true,
    });

    const url = 'http://example.com/test.ins';

    await expect(cache.fetch(url)).rejects.toThrow(/HTTP URLs are not allowed/);
  });

  test('validates .ins file content', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', '100']]),
      text: async () => `
inst test type=pulse1
pat melody = C5 E5 G5
`,
    });

    const cache = new RemoteInstrumentCache({
      fetchFn: mockFetch as any,
    });

    const url = 'https://example.com/invalid.ins';

    await expect(cache.fetch(url)).rejects.toThrow(/Invalid remote .ins file/);
  });

  test('handles fetch errors', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const cache = new RemoteInstrumentCache({
      fetchFn: mockFetch as any,
    });

    const url = 'https://example.com/notfound.ins';

    await expect(cache.fetch(url)).rejects.toThrow(/404 Not Found/);
  });

  test('clears cache', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', '100']]),
      text: async () => 'inst test type=pulse1',
    });

    const cache = new RemoteInstrumentCache({
      fetchFn: mockFetch as any,
    });

    await cache.fetch('https://example.com/test1.ins');
    await cache.fetch('https://example.com/test2.ins');

    expect(cache.getStats().size).toBe(2);

    cache.clear();

    expect(cache.getStats().size).toBe(0);
  });
});
