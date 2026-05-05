/**
 * Unit tests for GD3 tag encoder.
 */

import { buildGd3, encodeUtf16LeNullTerminated } from '../src/gd3.js';
import { GD3_MAGIC, GD3_VERSION } from '../src/constants.js';

describe('encodeUtf16LeNullTerminated', () => {
  it('encodes an empty string as two zero bytes (null terminator only)', () => {
    const bytes = encodeUtf16LeNullTerminated('');
    expect(bytes).toEqual([0x00, 0x00]);
  });

  it('encodes ASCII characters correctly', () => {
    const bytes = encodeUtf16LeNullTerminated('AB');
    // A = 0x41, B = 0x42
    expect(bytes).toEqual([0x41, 0x00, 0x42, 0x00, 0x00, 0x00]);
  });

  it('ends with two null bytes', () => {
    const bytes = encodeUtf16LeNullTerminated('Test');
    expect(bytes[bytes.length - 2]).toBe(0x00);
    expect(bytes[bytes.length - 1]).toBe(0x00);
  });
});

describe('buildGd3', () => {
  const fields = {
    trackTitleEn: 'Test Song',
    gameNameEn: 'Test Game',
    systemNameEn: 'Sega Master System',
    authorEn: 'Test Author',
    date: '2025',
    creator: 'BeatBax',
    notes: 'Test notes',
  };

  it('starts with the GD3 magic bytes', () => {
    const gd3 = buildGd3(fields);
    const view = new DataView(gd3.buffer);
    expect(view.getUint32(0, true)).toBe(GD3_MAGIC);
  });

  it('has the correct version', () => {
    const gd3 = buildGd3(fields);
    const view = new DataView(gd3.buffer);
    expect(view.getUint32(4, true)).toBe(GD3_VERSION);
  });

  it('data length matches actual string data length', () => {
    const gd3 = buildGd3(fields);
    const view = new DataView(gd3.buffer);
    const dataLength = view.getUint32(8, true);
    expect(gd3.length).toBe(12 + dataLength);
  });

  it('produces output for empty fields', () => {
    const emptyFields = {
      trackTitleEn: '',
      gameNameEn: '',
      systemNameEn: '',
      authorEn: '',
      date: '',
      creator: '',
      notes: '',
    };
    const gd3 = buildGd3(emptyFields);
    // 11 empty strings × 2 bytes each (just null terminators)
    expect(gd3.length).toBe(12 + 11 * 2);
  });
});
