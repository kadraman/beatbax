/**
 * Tests for BeatBaxStorage and BeatBaxSettings (utils/local-storage.ts)
 */

import {
  BeatBaxStorage,
  BeatBaxSettings,
  StorageKey,
  STORAGE_PREFIX,
  storage,
} from '../src/utils/local-storage';

// jsdom provides a localStorage implementation; clear it between tests.
beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

// ─── STORAGE_PREFIX ───────────────────────────────────────────────────────────

describe('STORAGE_PREFIX', () => {
  it('starts with "beatbax:"', () => {
    expect(STORAGE_PREFIX).toBe('beatbax:');
  });
});

// ─── BeatBaxStorage — get / set ───────────────────────────────────────────────

describe('BeatBaxStorage — get / set', () => {
  let store: BeatBaxStorage;
  beforeEach(() => { store = new BeatBaxStorage(); });

  it('stores and retrieves a string value', () => {
    store.set('test.key', 'hello');
    expect(store.get('test.key')).toBe('hello');
  });

  it('returns undefined for a missing key', () => {
    expect(store.get('missing')).toBeUndefined();
  });

  it('returns the provided default for a missing key', () => {
    expect(store.get('missing', 'fallback')).toBe('fallback');
  });

  it('prefixes values in actual localStorage', () => {
    store.set('my.key', 'value');
    expect(localStorage.getItem(`${STORAGE_PREFIX}my.key`)).toBe('value');
  });

  it('has() returns true for an existing key, false for missing', () => {
    store.set('exists', 'yes');
    expect(store.has('exists')).toBe(true);
    expect(store.has('nope')).toBe(false);
  });
});

// ─── BeatBaxStorage — getJSON / setJSON ──────────────────────────────────────

describe('BeatBaxStorage — getJSON / setJSON', () => {
  let store: BeatBaxStorage;
  beforeEach(() => { store = new BeatBaxStorage(); });

  it('round-trips a boolean', () => {
    store.setJSON('flag', false);
    expect(store.getJSON<boolean>('flag')).toBe(false);
  });

  it('round-trips an object', () => {
    const obj = { bpm: 140, channels: [1, 2] };
    store.setJSON('meta', obj);
    expect(store.getJSON('meta')).toEqual(obj);
  });

  it('returns defaultValue when key is absent', () => {
    expect(store.getJSON('nope', 42)).toBe(42);
  });

  it('returns defaultValue when stored value is invalid JSON', () => {
    localStorage.setItem(`${STORAGE_PREFIX}broken`, '{{bad}}');
    expect(store.getJSON('broken', 'safe')).toBe('safe');
  });
});

// ─── BeatBaxStorage — remove ──────────────────────────────────────────────────

describe('BeatBaxStorage — remove', () => {
  let store: BeatBaxStorage;
  beforeEach(() => { store = new BeatBaxStorage(); });

  it('removes a key so get returns undefined', () => {
    store.set('temp', 'data');
    store.remove('temp');
    expect(store.get('temp')).toBeUndefined();
  });

  it('remove on a missing key does not throw', () => {
    expect(() => store.remove('nonexistent')).not.toThrow();
  });
});

// ─── BeatBaxStorage — clear ───────────────────────────────────────────────────

describe('BeatBaxStorage — clear', () => {
  it('removes only keys that carry the beatbax: prefix', () => {
    const store = new BeatBaxStorage();
    store.set('a', '1');
    store.set('b', '2');
    // A foreign key that must not be touched
    localStorage.setItem('other:key', 'preserve');

    store.clear();

    expect(store.has('a')).toBe(false);
    expect(store.has('b')).toBe(false);
    expect(localStorage.getItem('other:key')).toBe('preserve');
  });

  it('clear() on an empty store does not throw', () => {
    const store = new BeatBaxStorage();
    expect(() => store.clear()).not.toThrow();
  });
});

// ─── BeatBaxStorage — entries ─────────────────────────────────────────────────

describe('BeatBaxStorage — entries', () => {
  it('returns a record of all owned keys without the prefix', () => {
    const store = new BeatBaxStorage();
    store.set('x', 'foo');
    store.set('y', 'bar');
    localStorage.setItem('foreign:z', 'baz');

    const result = store.entries();
    expect(result).toEqual({ x: 'foo', y: 'bar' });
  });
});

// ─── Custom prefix isolation ──────────────────────────────────────────────────

describe('BeatBaxStorage — prefix isolation', () => {
  it('two stores with different prefixes do not share keys', () => {
    const a = new BeatBaxStorage('ns-a:');
    const b = new BeatBaxStorage('ns-b:');

    a.set('key', 'from-a');
    expect(b.get('key')).toBeUndefined();
  });
});

// ─── BeatBaxSettings ─────────────────────────────────────────────────────────

describe('BeatBaxSettings', () => {
  it('getTheme() defaults to "dark"', () => {
    expect(BeatBaxSettings.getTheme()).toBe('dark');
  });

  it('setTheme / getTheme round-trip', () => {
    BeatBaxSettings.setTheme('light');
    expect(BeatBaxSettings.getTheme()).toBe('light');
  });

  it('isAutoSaveEnabled() defaults to true', () => {
    expect(BeatBaxSettings.isAutoSaveEnabled()).toBe(true);
  });

  it('setAutoSave / isAutoSaveEnabled round-trip', () => {
    BeatBaxSettings.setAutoSave(false);
    expect(BeatBaxSettings.isAutoSaveEnabled()).toBe(false);
  });

  it('getEditorContent() returns undefined when never set', () => {
    expect(BeatBaxSettings.getEditorContent()).toBeUndefined();
  });

  it('setEditorContent / getEditorContent round-trip', () => {
    BeatBaxSettings.setEditorContent('chip gameboy\nbpm 120');
    expect(BeatBaxSettings.getEditorContent()).toBe('chip gameboy\nbpm 120');
  });

  it('getLastExportFormat() returns undefined when never set', () => {
    expect(BeatBaxSettings.getLastExportFormat()).toBeUndefined();
  });

  it('setLastExportFormat / getLastExportFormat round-trip', () => {
    BeatBaxSettings.setLastExportFormat('midi');
    expect(BeatBaxSettings.getLastExportFormat()).toBe('midi');
  });
});

// ─── Shared singleton ─────────────────────────────────────────────────────────

describe('storage singleton', () => {
  it('is a BeatBaxStorage instance', () => {
    expect(storage).toBeInstanceOf(BeatBaxStorage);
  });

  it('uses the beatbax: prefix', () => {
    storage.set(StorageKey.THEME, 'dark');
    expect(localStorage.getItem(`${STORAGE_PREFIX}${StorageKey.THEME}`)).toBe('dark');
  });
});
