/**
 * VGM binary buffer builder.
 *
 * Handles:
 *   - Header construction and field patching
 *   - Command byte appending (PSG write, GG stereo, wait)
 *   - Wait command selection (most compact encoding)
 *   - Final assembly of header + data + GD3 into a single Uint8Array
 */

import {
  VGM_MAGIC,
  VGM_VERSION,
  VGM_HEADER_SIZE,
  HDR_EOF_OFFSET,
  HDR_VERSION,
  HDR_SN76489_CLOCK,
  HDR_YM2413_CLOCK,
  HDR_GD3_OFFSET,
  HDR_TOTAL_SAMPLES,
  HDR_LOOP_OFFSET,
  HDR_LOOP_SAMPLES,
  HDR_RATE,
  HDR_SN_FEEDBACK,
  HDR_SN_SHIFT_REG,
  HDR_SN_FLAGS,
  HDR_DATA_OFFSET,
  HDR_AY8910_CLOCK,
  SN76489_FEEDBACK,
  SN76489_SHIFT_REG_WIDTH,
  SN76489_FLAGS,
  CMD_WAIT_N,
  CMD_WAIT_735,
  CMD_WAIT_882,
  CMD_END,
  SAMPLES_PER_60HZ,
  SAMPLES_PER_50HZ,
  MAX_WAIT_N_SAMPLES,
} from './constants.js';

// ─── Growable byte buffer ─────────────────────────────────────────────────────

export class VgmBuffer {
  private bytes: number[] = [];

  appendByte(b: number): void {
    this.bytes.push(b & 0xFF);
  }

  appendUint16LE(n: number): void {
    this.bytes.push(n & 0xFF, (n >> 8) & 0xFF);
  }

  appendUint32LE(n: number): void {
    this.bytes.push(
      n & 0xFF,
      (n >> 8) & 0xFF,
      (n >> 16) & 0xFF,
      (n >> 24) & 0xFF,
    );
  }

  setUint32LE(offset: number, n: number): void {
    this.bytes[offset]     = n & 0xFF;
    this.bytes[offset + 1] = (n >> 8) & 0xFF;
    this.bytes[offset + 2] = (n >> 16) & 0xFF;
    this.bytes[offset + 3] = (n >> 24) & 0xFF;
  }

  setUint16LE(offset: number, n: number): void {
    this.bytes[offset]     = n & 0xFF;
    this.bytes[offset + 1] = (n >> 8) & 0xFF;
  }

  setByteAt(offset: number, n: number): void {
    this.bytes[offset] = n & 0xFF;
  }

  get length(): number {
    return this.bytes.length;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

// ─── Header ──────────────────────────────────────────────────────────────────

export interface VgmHeaderParams {
  /** SN76489 clock in Hz (offset 0x0C) */
  sn76489Clock?: number;
  /** YM2413 (OPLL) clock in Hz (offset 0x10); 0 when unused */
  ym2413Clock?: number;
  /** AY-3-8910 / YM2149 clock in Hz (offset 0xA0); 0 when unused */
  ay8910Clock?: number;
  /** Frame rate hint (60 = NTSC, 50 = PAL) */
  rate: number;
  /** Relative loop offset (0 = no loop) */
  loopOffset?: number;
  /** Samples in loop region (0 = no loop) */
  loopSamples?: number;
}

function computeHeaderSize(params: VgmHeaderParams): number {
  // AY clock lives at 0xA0..0xA3, so we need at least 0xA4 bytes when used.
  if (params.ay8910Clock !== undefined) {
    return HDR_AY8910_CLOCK + 4;
  }
  return VGM_HEADER_SIZE;
}

function computeDataOffsetValue(headerSize: number): number {
  // Field at 0x34 is a relative pointer from 0x34 to the first data byte.
  return headerSize - HDR_DATA_OFFSET;
}

/**
 * Build a zeroed VGM header buffer with the static fields pre-filled.
 * Dynamic fields (EOF offset, total samples, GD3 offset) are patched later
 * by finaliseHeader().
 */
export function buildVgmHeader(params: VgmHeaderParams): VgmBuffer {
  const header = new VgmBuffer();
  const headerSize = computeHeaderSize(params);

  // Pad to target header size with zeros.
  for (let i = 0; i < headerSize; i++) {
    header.appendByte(0);
  }

  header.setUint32LE(0x00, VGM_MAGIC);
  // 0x04 = EOF offset — patched later
  header.setUint32LE(HDR_VERSION, VGM_VERSION);
  header.setUint32LE(HDR_SN76489_CLOCK, params.sn76489Clock ?? 0);
  header.setUint32LE(HDR_YM2413_CLOCK, params.ym2413Clock ?? 0);
  // 0x14 = GD3 offset — patched later
  // 0x18 = total samples — patched later
  header.setUint32LE(HDR_LOOP_OFFSET, params.loopOffset ?? 0);
  header.setUint32LE(HDR_LOOP_SAMPLES, params.loopSamples ?? 0);
  header.setUint32LE(HDR_RATE, params.rate);
  header.setUint16LE(HDR_SN_FEEDBACK, SN76489_FEEDBACK);
  header.setByteAt(HDR_SN_SHIFT_REG, SN76489_SHIFT_REG_WIDTH);
  header.setByteAt(HDR_SN_FLAGS, SN76489_FLAGS);
  header.setUint32LE(HDR_DATA_OFFSET, computeDataOffsetValue(headerSize));
  if (params.ay8910Clock !== undefined) {
    header.setUint32LE(HDR_AY8910_CLOCK, params.ay8910Clock);
  }

  return header;
}

function computeDataStartFromHeader(header: VgmBuffer): number {
  const headerBytes = header.toUint8Array();
  const view = new DataView(
    headerBytes.buffer,
    headerBytes.byteOffset,
    headerBytes.byteLength,
  );
  const relDataOffset = view.getUint32(HDR_DATA_OFFSET, true);
  const dataStartFromField = HDR_DATA_OFFSET + relDataOffset;
  // Never allow data to overlap header bytes even if the field is malformed.
  return Math.max(header.length, dataStartFromField);
}

/**
 * Patch the dynamic header fields after the data section has been fully built.
 *
 * @param header        Header VgmBuffer (size may exceed VGM_HEADER_SIZE when extended fields are present)
 * @param totalSamples  Total 44100 Hz sample count for the full song
 * @param gd3Offset     Absolute byte offset of the GD3 tag in the final file
 * @param totalFileSize Total size of the assembled VGM file in bytes
 */
export function finaliseHeader(
  header: VgmBuffer,
  totalSamples: number,
  gd3Offset: number,
  totalFileSize: number,
): void {
  // EOF offset is relative to 0x04
  const eofOffset = totalFileSize - 4;
  header.setUint32LE(HDR_EOF_OFFSET, eofOffset);

  // Total samples
  header.setUint32LE(HDR_TOTAL_SAMPLES, Math.round(totalSamples));

  // GD3 offset is relative to 0x14 (HDR_GD3_OFFSET)
  const gd3RelOffset = gd3Offset > 0 ? gd3Offset - HDR_GD3_OFFSET : 0;
  header.setUint32LE(HDR_GD3_OFFSET, gd3RelOffset);
}

// ─── Wait commands ────────────────────────────────────────────────────────────

/**
 * Append the most compact VGM wait encoding for `samples` samples.
 * Uses 0x62 (735), 0x63 (882), or 0x61 <lo> <hi> for arbitrary counts.
 * Handles counts > 0xFFFF by splitting into multiple waits.
 */
export function appendWait(data: number[], samples: number): void {
  samples = Math.round(samples);
  while (samples > 0) {
    if (samples >= SAMPLES_PER_60HZ && samples % SAMPLES_PER_60HZ === 0) {
      // Emit as many 0x62 (735-sample) waits as possible
      const count = Math.floor(samples / SAMPLES_PER_60HZ);
      for (let i = 0; i < count; i++) {
        data.push(CMD_WAIT_735);
      }
      samples = 0;
    } else if (samples >= SAMPLES_PER_50HZ && samples % SAMPLES_PER_50HZ === 0) {
      // Emit as many 0x63 (882-sample) waits as possible
      const count = Math.floor(samples / SAMPLES_PER_50HZ);
      for (let i = 0; i < count; i++) {
        data.push(CMD_WAIT_882);
      }
      samples = 0;
    } else {
      // Use 0x61 for the remainder, clamped to 16-bit max
      const chunk = Math.min(samples, MAX_WAIT_N_SAMPLES);
      data.push(CMD_WAIT_N, chunk & 0xFF, (chunk >> 8) & 0xFF);
      samples -= chunk;
    }
  }
}

// ─── Final assembly ───────────────────────────────────────────────────────────

/**
 * Assemble a complete VGM file from its components.
 *
 * @param headerParams  Static header parameters
 * @param dataBytes     VGM data section (commands up to and including 0x66)
 * @param gd3Block      GD3 block (may be empty / zero-length)
 * @param totalSamples  Total samples for the track
 * @returns             Complete VGM file as a Uint8Array
 */
export function assembleVgm(
  headerParams: VgmHeaderParams,
  dataBytes: number[] | Uint8Array,
  gd3Block: Uint8Array,
  totalSamples: number,
): Uint8Array {
  // Normalise to a mutable number array so we can push CMD_END if needed
  const data: number[] = dataBytes instanceof Uint8Array
    ? Array.from(dataBytes)
    : [...dataBytes];

  // Ensure the data section ends with 0x66
  if (data.length === 0 || data[data.length - 1] !== CMD_END) {
    data.push(CMD_END);
  }

  const header = buildVgmHeader(headerParams);
  const dataStart  = computeDataStartFromHeader(header);
  const gd3Start   = dataStart + data.length;
  const totalSize  = gd3Start + gd3Block.length;

  finaliseHeader(header, totalSamples, gd3Block.length > 0 ? gd3Start : 0, totalSize);

  const out = new Uint8Array(totalSize);
  out.set(header.toUint8Array(), 0);
  for (let i = 0; i < data.length; i++) {
    out[dataStart + i] = data[i];
  }
  out.set(gd3Block, gd3Start);

  return out;
}
