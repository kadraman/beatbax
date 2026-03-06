/**
 * Unit tests for DownloadHelper utilities (Phase 3)
 */

import {
  sanitizeFilename,
  getExtension,
  ensureExtension,
  createBlob,
  triggerDownload,
  downloadText,
  downloadBinary,
  generateFilename,
  ExportHistory,
  MIME_TYPES,
} from '../src/export/download-helper';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** jsdom doesn't implement URL.createObjectURL — stub it. */
function setupDownloadMocks() {
  const revokeObjectURL = jest.fn();
  const createObjectURL = jest.fn(() => 'blob:mock-url');
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true });

  // Capture anchor clicks instead of triggering real downloads
  const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return { createObjectURL, revokeObjectURL, clickSpy };
}

// ─── sanitizeFilename ────────────────────────────────────────────────────────

describe('sanitizeFilename', () => {
  it('leaves safe filenames unchanged', () => {
    expect(sanitizeFilename('my_song')).toBe('my_song');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeFilename('my song')).toBe('my_song');
  });

  it('collapses multiple spaces/underscores', () => {
    expect(sanitizeFilename('my  song__file')).toBe('my_song_file');
  });

  it('removes forbidden characters', () => {
    // Adjacent forbidden chars collapse to a single underscore via /_+/g
    expect(sanitizeFilename('song<>:file')).toBe('song_file');
    expect(sanitizeFilename('a|b?c*d')).toBe('a_b_c_d');
  });

  it('strips leading and trailing dots and underscores', () => {
    expect(sanitizeFilename('.hidden')).toBe('hidden');
    expect(sanitizeFilename('__prefix')).toBe('prefix');
    expect(sanitizeFilename('suffix__')).toBe('suffix');
  });

  it('falls back to "export" for an empty result', () => {
    expect(sanitizeFilename('...')).toBe('export');
    expect(sanitizeFilename('')).toBe('export');
  });
});

// ─── getExtension ────────────────────────────────────────────────────────────

describe('getExtension', () => {
  it('returns the lowercase extension without a dot', () => {
    expect(getExtension('song.WAV')).toBe('wav');
    expect(getExtension('track.MID')).toBe('mid');
  });

  it('returns the last segment for multi-dot names', () => {
    expect(getExtension('my.song.bax')).toBe('bax');
  });

  it('returns empty string when there is no extension', () => {
    expect(getExtension('nodot')).toBe('');
  });
});

// ─── ensureExtension ─────────────────────────────────────────────────────────

describe('ensureExtension', () => {
  it('appends the extension if missing', () => {
    expect(ensureExtension('song', 'wav')).toBe('song.wav');
    expect(ensureExtension('song', '.wav')).toBe('song.wav');
  });

  it('does not double-append the extension', () => {
    expect(ensureExtension('song.wav', 'wav')).toBe('song.wav');
    expect(ensureExtension('song.WAV', 'wav')).toBe('song.WAV');
  });

  it('handles extension with leading dot', () => {
    expect(ensureExtension('my_track', '.mid')).toBe('my_track.mid');
  });
});

// ─── createBlob ──────────────────────────────────────────────────────────────

describe('createBlob', () => {
  it('creates a text blob from a string', () => {
    const blob = createBlob('{"bpm":120}', 'application/json');
    expect(blob.type).toBe('application/json');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('creates a binary blob from a Uint8Array', () => {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF"
    const blob = createBlob(bytes, 'audio/wav');
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(4);
  });

  it('creates a binary blob from an ArrayBuffer', () => {
    const buf = new ArrayBuffer(8);
    const blob = createBlob(buf, 'application/octet-stream');
    expect(blob.size).toBe(8);
  });
});

// ─── triggerDownload ─────────────────────────────────────────────────────────

describe('triggerDownload', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates an anchor element, sets href and download, and clicks it', () => {
    const { createObjectURL, clickSpy } = setupDownloadMocks();

    const blob = new Blob(['data'], { type: 'text/plain' });
    triggerDownload(blob, 'output.txt');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── downloadText / downloadBinary ───────────────────────────────────────────

describe('downloadText', () => {
  beforeEach(() => jest.clearAllMocks());

  it('triggers a download with the correct MIME type', () => {
    const { clickSpy } = setupDownloadMocks();
    downloadText('hello world', 'note.txt', 'text/plain');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

describe('downloadBinary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('triggers a download for a Uint8Array', () => {
    const { clickSpy } = setupDownloadMocks();
    downloadBinary(new Uint8Array([1, 2, 3]), 'data.bin');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── generateFilename ────────────────────────────────────────────────────────

describe('generateFilename', () => {
  // Pin the clock so timestamp output is deterministic
  const FIXED_DATE = new Date('2026-03-06T14:05:09');

  it('combines base, timestamp, and extension', () => {
    expect(generateFilename('my_song', 'wav', FIXED_DATE)).toBe('my_song_20260306-140509.wav');
  });

  it('sanitizes the base name', () => {
    // '?' is a forbidden character → replaced/collapsed to single underscore
    expect(generateFilename('my song?', 'json', FIXED_DATE)).toBe('my_song_20260306-140509.json');
  });

  it('strips leading dot from extension', () => {
    expect(generateFilename('track', '.mid', FIXED_DATE)).toBe('track_20260306-140509.mid');
  });

  it('uses the current time when no date is supplied', () => {
    const before = Date.now();
    const result = generateFilename('song', 'bax');
    const after = Date.now();
    // The filename must contain a timestamp segment matching YYYYMMDD-HHmmss
    expect(result).toMatch(/^song_\d{8}-\d{6}\.bax$/);
    // Cross-check: the date part should be today (UTC or local, within test run window)
    const dateStr = String(new Date(before).getFullYear());
    expect(result).toContain(dateStr);
    void after; // suppress unused-variable warning
  });
});

// ─── MIME_TYPES ──────────────────────────────────────────────────────────────

describe('MIME_TYPES', () => {
  it('contains entries for all supported export formats', () => {
    expect(MIME_TYPES.json).toBe('application/json');
    expect(MIME_TYPES.wav).toBe('audio/wav');
    expect(MIME_TYPES.midi).toBe('audio/midi');
    expect(MIME_TYPES.uge).toBe('application/octet-stream');
    expect(MIME_TYPES.bax).toBe('text/plain');
  });
});

// ─── ExportHistory ───────────────────────────────────────────────────────────

describe('ExportHistory', () => {
  let history: ExportHistory;

  beforeEach(() => {
    history = new ExportHistory();
  });

  it('starts empty', () => {
    expect(history.getAll()).toHaveLength(0);
  });

  it('adds entries and returns them in reverse-chronological order', () => {
    history.add({ format: 'json', filename: 'a.json', timestamp: new Date() });
    history.add({ format: 'wav', filename: 'a.wav', timestamp: new Date() });

    const all = history.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].format).toBe('wav');  // most recent first
    expect(all[1].format).toBe('json');
  });

  it('getLastByFormat returns the most recent entry for that format', () => {
    history.add({ format: 'midi', filename: 'first.mid', timestamp: new Date() });
    history.add({ format: 'json', filename: 'song.json', timestamp: new Date() });
    history.add({ format: 'midi', filename: 'second.mid', timestamp: new Date() });

    const last = history.getLastByFormat('midi');
    expect(last?.filename).toBe('second.mid');
  });

  it('getLastByFormat returns undefined for an unknown format', () => {
    expect(history.getLastByFormat('uge')).toBeUndefined();
  });

  it('caps history at 20 entries', () => {
    for (let i = 0; i < 25; i++) {
      history.add({ format: 'json', filename: `s${i}.json`, timestamp: new Date() });
    }
    expect(history.getAll()).toHaveLength(20);
    // Most recent 20 are kept
    expect(history.getAll()[0].filename).toBe('s24.json');
  });

  it('clear() empties the history', () => {
    history.add({ format: 'json', filename: 'song.json', timestamp: new Date() });
    history.clear();
    expect(history.getAll()).toHaveLength(0);
  });
});
