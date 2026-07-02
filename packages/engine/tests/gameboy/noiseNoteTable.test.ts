import {
  resolveNoisePlayback,
  hugeTrackerNoteToIndex,
  ugeNoteIndexToNr43Poly,
  resolveNoiseNoteIndex,
  parseNoiseWidth,
  nr43ToLfsrHz,
  beatbaxNoteToUgeIndex,
  DEFAULT_NOISE_NOTE_INDEX,
  type GbNoisePreviewMode,
} from '../../src/chips/gameboy/noiseNoteTable';

describe('noiseNoteTable', () => {
  describe('hugeTrackerNoteToIndex', () => {
    test('maps kick/snare/hat fixtures', () => {
      expect(hugeTrackerNoteToIndex('C-6')).toBe(36);
      expect(hugeTrackerNoteToIndex('C-7')).toBe(48);
      expect(hugeTrackerNoteToIndex('C-8')).toBe(60);
    });

    test('rejects invalid notation', () => {
      expect(hugeTrackerNoteToIndex('C6')).toBe(-1);
      expect(hugeTrackerNoteToIndex('C-2')).toBe(-1);
    });
  });

  describe('ugeNoteIndexToNr43Poly (hUGEDriver get_note_poly)', () => {
    test('kick C-6 → NR43 poly 0x57', () => {
      expect(ugeNoteIndexToNr43Poly(36)).toBe(0x57);
    });

    test('snare C-7 → NR43 poly 0x27', () => {
      expect(ugeNoteIndexToNr43Poly(48)).toBe(0x27);
    });

    test('hat C-8 → NR43 poly 0x03', () => {
      expect(ugeNoteIndexToNr43Poly(60)).toBe(0x03);
    });
  });

  describe('resolveNoiseNoteIndex', () => {
    test('prefers gb:uge_note over note=', () => {
      const idx = resolveNoiseNoteIndex(
        { uge_note: 'C-7', note: 'C2' },
      );
      expect(idx).toBe(48);
    });

    test('falls back to note= in BeatBax notation', () => {
      // BeatBax C5 → hUGETracker C-6 (index 36)
      expect(beatbaxNoteToUgeIndex('C5')).toBe(36);
    });

    test('defaults to C-5 when nothing declared', () => {
      expect(resolveNoiseNoteIndex({})).toBe(DEFAULT_NOISE_NOTE_INDEX);
    });
  });

  describe('resolveNoisePlayback', () => {
    test('kick/snare/hat LFSR rates match hUGEDriver NR43 mapping', () => {
      const kick = resolveNoisePlayback({ uge_note: 'C-6', 'gb:width': 7 });
      expect(kick.noteIndex).toBe(36);
      expect(kick.nr43).toBe(0x57 | 0x08);
      expect(kick.lfsrHz).toBeCloseTo(524288 / (112 * 64), 5);

      const snare = resolveNoisePlayback({ uge_note: 'C-7', 'gb:width': 7 });
      expect(snare.noteIndex).toBe(48);
      expect(snare.nr43).toBe(0x27 | 0x08);
      expect(snare.lfsrHz).toBeCloseTo(524288 / (112 * 8), 5);

      const hat = resolveNoisePlayback({ uge_note: 'C-8', 'gb:width': 15 });
      expect(hat.noteIndex).toBe(60);
      expect(hat.nr43).toBe(0x03);
      expect(hat.lfsrHz).toBeCloseTo(524288 / (48 * 2), 5);
    });

    test('7-bit width ORs NR43 bit 3 without changing note index', () => {
      const metallic = resolveNoisePlayback({ uge_note: 'C-7', 'gb:width': 7 });
      const broad = resolveNoisePlayback({ uge_note: 'C-7', 'gb:width': 15 });
      expect(metallic.noteIndex).toBe(broad.noteIndex);
      expect(metallic.nr43).toBe(broad.nr43 | 0x08);
      expect(metallic.lfsrHz).toBe(broad.lfsrHz);
      expect(parseNoiseWidth({ 'gb:width': 7 })).toBe(7);
    });

    test('legacy mode preserves pre-parity defaults', () => {
      const legacy = resolveNoisePlayback({ uge_note: 'C-7' }, undefined, 'legacy');
      expect(legacy.lfsrHz).toBeCloseTo(4194304 / (3 * Math.pow(2, 5)), 5);
    });

    test('nr43ToLfsrHz matches resolveNoisePlayback', () => {
      const poly = ugeNoteIndexToNr43Poly(48);
      expect(nr43ToLfsrHz(poly)).toBeCloseTo(
        resolveNoisePlayback({ uge_note: 'C-7' }).lfsrHz,
        8,
      );
    });
  });

  describe('gb_uge_note_demo parity', () => {
    test('export row indices match playback-resolved indices', () => {
      const fixtures = [
        { uge_note: 'C-6', expected: 36 },
        { uge_note: 'C-7', expected: 48 },
        { uge_note: 'C-8', expected: 60 },
      ];
      for (const { uge_note, expected } of fixtures) {
        expect(hugeTrackerNoteToIndex(uge_note)).toBe(expected);
        expect(resolveNoiseNoteIndex({ uge_note })).toBe(expected);
      }
    });
  });
});
