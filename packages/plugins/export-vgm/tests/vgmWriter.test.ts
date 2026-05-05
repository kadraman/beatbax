/**
 * Unit tests for VGM buffer / header / wait encoding.
 */

import { VgmBuffer, buildVgmHeader, appendWait, assembleVgm } from '../src/vgmWriter.js';
import {
  VGM_MAGIC,
  VGM_VERSION,
  VGM_HEADER_SIZE,
  VGM_DATA_OFFSET_VALUE,
  CMD_WAIT_735,
  CMD_WAIT_882,
  CMD_WAIT_N,
  CMD_END,
  SAMPLES_PER_60HZ,
  SAMPLES_PER_50HZ,
  SN76489_CLOCK_NTSC,
  SN76489_FEEDBACK,
  SN76489_SHIFT_REG_WIDTH,
  HDR_SN_FEEDBACK,
  HDR_SN_SHIFT_REG,
  HDR_DATA_OFFSET,
} from '../src/constants.js';

describe('VgmBuffer', () => {
  it('appendByte writes a single byte', () => {
    const buf = new VgmBuffer();
    buf.appendByte(0xAB);
    expect(buf.length).toBe(1);
    expect(buf.toUint8Array()[0]).toBe(0xAB);
  });

  it('appendUint32LE writes 4 bytes little-endian', () => {
    const buf = new VgmBuffer();
    buf.appendUint32LE(0x12345678);
    const arr = buf.toUint8Array();
    expect(arr[0]).toBe(0x78);
    expect(arr[1]).toBe(0x56);
    expect(arr[2]).toBe(0x34);
    expect(arr[3]).toBe(0x12);
  });

  it('setUint32LE patches existing bytes', () => {
    const buf = new VgmBuffer();
    buf.appendUint32LE(0);
    buf.setUint32LE(0, 0xDEADBEEF);
    const arr = buf.toUint8Array();
    expect(arr[0]).toBe(0xEF);
    expect(arr[1]).toBe(0xBE);
    expect(arr[2]).toBe(0xAD);
    expect(arr[3]).toBe(0xDE);
  });
});

describe('buildVgmHeader', () => {
  it('is exactly VGM_HEADER_SIZE bytes', () => {
    const header = buildVgmHeader({ sn76489Clock: SN76489_CLOCK_NTSC, rate: 60 });
    expect(header.length).toBe(VGM_HEADER_SIZE);
  });

  it('starts with VGM_MAGIC', () => {
    const header = buildVgmHeader({ sn76489Clock: SN76489_CLOCK_NTSC, rate: 60 });
    const arr = header.toUint8Array();
    const view = new DataView(arr.buffer);
    expect(view.getUint32(0, true)).toBe(VGM_MAGIC);
  });

  it('contains VGM_VERSION at offset 0x08', () => {
    const header = buildVgmHeader({ sn76489Clock: SN76489_CLOCK_NTSC, rate: 60 });
    const arr = header.toUint8Array();
    const view = new DataView(arr.buffer);
    expect(view.getUint32(0x08, true)).toBe(VGM_VERSION);
  });

  it('contains SN76489 clock at offset 0x0C', () => {
    const header = buildVgmHeader({ sn76489Clock: SN76489_CLOCK_NTSC, rate: 60 });
    const arr = header.toUint8Array();
    const view = new DataView(arr.buffer);
    expect(view.getUint32(0x0C, true)).toBe(SN76489_CLOCK_NTSC);
  });

  it('encodes SN76489 feedback and shift width for SMS noise parity', () => {
    const header = buildVgmHeader({ sn76489Clock: SN76489_CLOCK_NTSC, rate: 60 });
    const arr = header.toUint8Array();
    const view = new DataView(arr.buffer);
    expect(SN76489_FEEDBACK).toBe(0x0009);
    expect(SN76489_SHIFT_REG_WIDTH).toBe(16);
    expect(view.getUint16(HDR_SN_FEEDBACK, true)).toBe(SN76489_FEEDBACK);
    expect(arr[HDR_SN_SHIFT_REG]).toBe(SN76489_SHIFT_REG_WIDTH);
  });

  it('encodes VGM data offset field for v1.61 header layout', () => {
    const header = buildVgmHeader({ sn76489Clock: SN76489_CLOCK_NTSC, rate: 60 });
    const arr = header.toUint8Array();
    const view = new DataView(arr.buffer);
    expect(view.getUint32(HDR_DATA_OFFSET, true)).toBe(VGM_DATA_OFFSET_VALUE);
  });
});

describe('appendWait', () => {
  it('emits 0x62 for exactly 735 samples (NTSC frame)', () => {
    const data: number[] = [];
    appendWait(data, SAMPLES_PER_60HZ);
    expect(data).toEqual([CMD_WAIT_735]);
  });

  it('emits 0x63 for exactly 882 samples (PAL frame)', () => {
    const data: number[] = [];
    appendWait(data, SAMPLES_PER_50HZ);
    expect(data).toEqual([CMD_WAIT_882]);
  });

  it('emits multiple 0x62 for multiples of 735', () => {
    const data: number[] = [];
    appendWait(data, SAMPLES_PER_60HZ * 4);
    expect(data).toEqual([CMD_WAIT_735, CMD_WAIT_735, CMD_WAIT_735, CMD_WAIT_735]);
  });

  it('emits CMD_WAIT_N for arbitrary sample counts', () => {
    const data: number[] = [];
    appendWait(data, 100);
    expect(data[0]).toBe(CMD_WAIT_N);
    expect(data[1]).toBe(100);  // lo byte
    expect(data[2]).toBe(0);    // hi byte
  });

  it('handles large sample count with CMD_WAIT_N', () => {
    const data: number[] = [];
    appendWait(data, 1000);
    expect(data[0]).toBe(CMD_WAIT_N);
    const val = data[1] | (data[2] << 8);
    expect(val).toBe(1000);
  });

  it('handles zero samples gracefully', () => {
    const data: number[] = [];
    appendWait(data, 0);
    expect(data.length).toBe(0);
  });

  it('splits samples > 0xFFFF into multiple waits', () => {
    const data: number[] = [];
    appendWait(data, 0x10000);
    // Two waits: 0xFFFF + 1
    expect(data.length).toBeGreaterThan(3);
  });
});

describe('assembleVgm', () => {
  it('produces a valid VGM file structure', () => {
    const dataBytes = [0x66]; // end-of-data marker
    const gd3Block = new Uint8Array(0);
    const result = assembleVgm(
      { sn76489Clock: SN76489_CLOCK_NTSC, rate: 60 },
      dataBytes,
      gd3Block,
      735,
    );

    expect(result.length).toBeGreaterThanOrEqual(VGM_HEADER_SIZE + 1);

    const view = new DataView(result.buffer);
    // Check magic
    expect(view.getUint32(0, true)).toBe(VGM_MAGIC);
    // Check version
    expect(view.getUint32(0x08, true)).toBe(VGM_VERSION);
    // EOF offset should be totalSize - 4
    expect(view.getUint32(0x04, true)).toBe(result.length - 4);
    // Data at offset 0x40 should be 0x66 (end marker)
    expect(result[VGM_HEADER_SIZE]).toBe(CMD_END);
  });

  it('appends 0x66 automatically if missing from dataBytes', () => {
    const dataBytes: number[] = []; // no end marker
    const gd3Block = new Uint8Array(0);
    const result = assembleVgm(
      { sn76489Clock: SN76489_CLOCK_NTSC, rate: 60 },
      dataBytes,
      gd3Block,
      0,
    );
    expect(result[VGM_HEADER_SIZE]).toBe(CMD_END);
  });
});
