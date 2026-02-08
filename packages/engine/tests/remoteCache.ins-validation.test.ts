/**
 * Test comprehensive .ins validation for remote imports.
 * Verifies that RemoteInstrumentCache rejects all non-inst directives,
 * including import directives (nested imports are not allowed for security).
 */

import { describe, test, expect } from '@jest/globals';
import { RemoteInstrumentCache } from '../src/import/remoteCache.js';

describe('Remote .ins File Validation - Comprehensive', () => {
  describe('Rejects disallowed directives', () => {
    test('rejects import directives (nested imports not allowed)', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('import "local:other.ins"\ninst test type=pulse1'),
      });

      await expect(
        cache.fetch('https://example.com/test.ins')
      ).rejects.toThrow(/imports \(nested imports are not allowed in remote \.ins files\)/);
    });

    test('rejects chip directive', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('chip gameboy\ninst test type=pulse1'),
      });

      await expect(
        cache.fetch('https://example.com/test.ins')
      ).rejects.toThrow(/chip/);
    });

    test('rejects bpm directive', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('bpm 140\ninst test type=pulse1'),
      });

      await expect(
        cache.fetch('https://example.com/test.ins')
      ).rejects.toThrow(/bpm/);
    });

    test('rejects volume directive', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('volume 0.8\ninst test type=pulse1'),
      });

      await expect(
        cache.fetch('https://example.com/test.ins')
      ).rejects.toThrow(/volume/);
    });

    test('rejects pattern definitions', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('pat melody = C4 E4 G4\ninst test type=pulse1'),
      });

      await expect(
        cache.fetch('https://example.com/test.ins')
      ).rejects.toThrow(/patterns/);
    });

    test('rejects sequence definitions', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('seq main = melody\ninst test type=pulse1'),
      });

      await expect(
        cache.fetch('https://example.com/test.ins')
      ).rejects.toThrow(/sequences/);
    });

    test('rejects channel declarations', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('channel 1 => inst test seq main\ninst test type=pulse1'),
      });

      await expect(
        cache.fetch('https://example.com/test.ins')
      ).rejects.toThrow(/channels/);
    });

    test('rejects play command', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('inst test type=pulse1\nplay'),
      });

      await expect(
        cache.fetch('https://example.com/test.ins')
      ).rejects.toThrow(/play/);
    });

    test('rejects non-empty metadata', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('song name "Test"\ninst test type=pulse1'),
      });

      await expect(
        cache.fetch('https://example.com/test.ins')
      ).rejects.toThrow(/metadata/);
    });
  });

  describe('Special cases', () => {
    test('rejects multiple disallowed directives', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('chip gameboy\nbpm 140\nvolume 0.8\ninst test type=pulse1'),
      });

      const promise = cache.fetch('https://example.com/test.ins');
      await expect(promise).rejects.toThrow(/Invalid remote \.ins file/);
      await expect(promise).rejects.toThrow(/chip/);
      await expect(promise).rejects.toThrow(/bpm/);
      await expect(promise).rejects.toThrow(/volume/);
    });

    test('provides clear error message for import directive', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('import "https://example.com/other.ins"\ninst test type=pulse1'),
      });

      await expect(
        cache.fetch('https://example.com/test.ins')
      ).rejects.toThrow(/nested imports are not allowed in remote \.ins files/);
    });
  });

  describe('Valid remote .ins files (should be accepted)', () => {
    test('accepts only inst declarations', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('inst lead type=pulse1 duty=50 env=12,down\ninst bass type=pulse2 duty=25 env=10,down'),
      });

      const result = await cache.fetch('https://example.com/test.ins');
      
      expect(result).toHaveProperty('lead');
      expect(result).toHaveProperty('bass');
      expect(result.lead.type).toBe('pulse1');
      expect(result.bass.type).toBe('pulse2');
    });

    test('accepts empty .ins file', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response(''),
      });

      const result = await cache.fetch('https://example.com/empty.ins');
      
      expect(result).toEqual({});
    });

    test('accepts inst declarations with comments', async () => {
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => new Response('# Lead instruments\ninst lead type=pulse1 duty=50\n# Bass instruments\ninst bass type=pulse2 duty=25'),
      });

      const result = await cache.fetch('https://example.com/test.ins');
      
      expect(result).toHaveProperty('lead');
      expect(result).toHaveProperty('bass');
    });
  });

  describe('Caching behavior', () => {
    test('caches valid remote .ins files', async () => {
      let fetchCount = 0;
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => {
          fetchCount++;
          return new Response('inst test type=pulse1');
        },
      });

      // First fetch
      const result1 = await cache.fetch('https://example.com/test.ins');
      expect(result1).toHaveProperty('test');
      expect(fetchCount).toBe(1);

      // Second fetch (should use cache)
      const result2 = await cache.fetch('https://example.com/test.ins');
      expect(result2).toHaveProperty('test');
      expect(fetchCount).toBe(1); // No additional fetch

      // Verify results are identical
      expect(result1).toEqual(result2);
    });

    test('does not cache invalid .ins files', async () => {
      let fetchCount = 0;
      const cache = new RemoteInstrumentCache({
        fetchFn: async () => {
          fetchCount++;
          return new Response('chip gameboy\ninst test type=pulse1');
        },
      });

      // First fetch (should fail)
      await expect(
        cache.fetch('https://example.com/invalid.ins')
      ).rejects.toThrow(/chip/);
      expect(fetchCount).toBe(1);

      // Second fetch (should fail again and fetch again)
      await expect(
        cache.fetch('https://example.com/invalid.ins')
      ).rejects.toThrow(/chip/);
      expect(fetchCount).toBe(2); // Additional fetch since previous failed
    });
  });
});
