/**
 * GD3 tag encoder for VGM files.
 *
 * GD3 is the standard metadata block appended to VGM files. All string fields
 * are encoded as null-terminated UTF-16LE sequences. Japanese fields are left
 * empty (two null bytes) unless explicitly provided.
 *
 * Reference: https://vgmrips.net/wiki/GD3_Specification
 */

import { GD3_MAGIC, GD3_VERSION } from './constants.js';

/**
 * GD3 metadata fields sourced from the ISM.
 */
export interface Gd3Fields {
  /** Track title (English) — from ISM metadata.name */
  trackTitleEn: string;
  /** Game / album name (English) */
  gameNameEn: string;
  /** System name (English) — "Sega Master System" or "Sega Game Gear" */
  systemNameEn: string;
  /** Track author / composer */
  authorEn: string;
  /** Release date */
  date: string;
  /** VGM creator tool name and version */
  creator: string;
  /** Freeform notes */
  notes: string;
}

/**
 * Encode a JavaScript string as a null-terminated UTF-16LE byte sequence.
 * Each code unit is written as two bytes (little-endian), followed by two
 * zero bytes as the null terminator.
 */
export function encodeUtf16LeNullTerminated(s: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    bytes.push(code & 0xFF, (code >> 8) & 0xFF);
  }
  // Null terminator: two zero bytes
  bytes.push(0x00, 0x00);
  return bytes;
}

/**
 * Build a GD3 tag block as a Uint8Array.
 *
 * Structure:
 *   4 bytes  magic "Gd3 "
 *   4 bytes  version 0x00000100
 *   4 bytes  data length (bytes following these 12 bytes)
 *   UTF-16LE null-terminated strings (11 fields, in order):
 *     1. Track title (English)
 *     2. Track title (Japanese)   — always empty
 *     3. Game name (English)
 *     4. Game name (Japanese)     — always empty
 *     5. System name (English)
 *     6. System name (Japanese)   — always empty
 *     7. Author (English)
 *     8. Author (Japanese)        — always empty
 *     9. Date
 *    10. VGM creator
 *    11. Notes
 */
export function buildGd3(fields: Gd3Fields): Uint8Array {
  const empty = encodeUtf16LeNullTerminated('');

  const strings = [
    encodeUtf16LeNullTerminated(fields.trackTitleEn),
    empty,                                                     // Japanese title
    encodeUtf16LeNullTerminated(fields.gameNameEn),
    empty,                                                     // Japanese game name
    encodeUtf16LeNullTerminated(fields.systemNameEn),
    empty,                                                     // Japanese system name
    encodeUtf16LeNullTerminated(fields.authorEn),
    empty,                                                     // Japanese author
    encodeUtf16LeNullTerminated(fields.date),
    encodeUtf16LeNullTerminated(fields.creator),
    encodeUtf16LeNullTerminated(fields.notes),
  ];

  // Flatten string data into a single array
  const dataBytes: number[] = [];
  for (const s of strings) {
    for (const b of s) {
      dataBytes.push(b);
    }
  }

  const dataLength = dataBytes.length;
  // GD3 header: magic (4) + version (4) + dataLength (4) = 12 bytes
  const buf = new Uint8Array(12 + dataLength);
  const view = new DataView(buf.buffer);

  view.setUint32(0, GD3_MAGIC, true);
  view.setUint32(4, GD3_VERSION, true);
  view.setUint32(8, dataLength, true);

  for (let i = 0; i < dataBytes.length; i++) {
    buf[12 + i] = dataBytes[i];
  }

  return buf;
}
