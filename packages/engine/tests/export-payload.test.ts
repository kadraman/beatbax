import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  isExportPayload,
  normalizeExporterResult,
} from '../src/export/payload.js';
import { writeExportPayload } from '../src/export/writeExportPayload.js';

describe('export payload helpers', () => {
  test('normalizeExporterResult accepts string payloads', () => {
    expect(normalizeExporterResult('hello')).toEqual({ data: 'hello' });
  });

  test('normalizeExporterResult accepts Uint8Array payloads', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(normalizeExporterResult(bytes)).toEqual({ data: bytes });
  });

  test('normalizeExporterResult accepts ArrayBuffer payloads', () => {
    const buffer = new ArrayBuffer(2);
    new Uint8Array(buffer).set([4, 5]);
    expect(normalizeExporterResult(buffer)).toEqual({ data: new Uint8Array([4, 5]) });
  });

  test('normalizeExporterResult accepts structured ExportPayload objects', () => {
    const payload = {
      data: new Uint8Array([9, 8, 7]),
      filename: 'song.vgm',
      mimeType: 'audio/x-vgm',
    };
    expect(isExportPayload(payload)).toBe(true);
    expect(normalizeExporterResult(payload)).toEqual(payload);
  });

  test('writeExportPayload writes string and binary payloads to disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'beatbax-export-payload-'));
    const textPath = join(dir, 'song.txt');
    const binPath = join(dir, 'song.bin');

    try {
      expect(writeExportPayload(textPath, 'abc')).toBe(true);
      expect(readFileSync(textPath, 'utf8')).toBe('abc');

      const bytes = new Uint8Array([0x56, 0x67, 0x6d]);
      expect(writeExportPayload(binPath, bytes)).toBe(true);
      expect([...readFileSync(binPath)]).toEqual([0x56, 0x67, 0x6d]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('writeExportPayload returns false for unsupported return values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'beatbax-export-payload-'));
    const outPath = join(dir, 'missing.bin');
    try {
      expect(writeExportPayload(outPath, undefined)).toBe(false);
      expect(existsSync(outPath)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('exporter plugin payload contract', () => {
  const song = { chip: 'gameboy', channels: [], insts: {}, bpm: 120 } as any;

  test('plugins can return string payloads', async () => {
    const plugin = {
      export: async (_song: unknown) => 'ftm-text',
    };
    const payload = normalizeExporterResult(await plugin.export(song));
    expect(payload?.data).toBe('ftm-text');
  });

  test('plugins can return Uint8Array payloads', async () => {
    const plugin = {
      export: async (_song: unknown) => new Uint8Array([1, 2, 3]),
    };
    const payload = normalizeExporterResult(await plugin.export(song));
    expect(payload?.data).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('plugins can return ArrayBuffer payloads', async () => {
    const buffer = new ArrayBuffer(1);
    new Uint8Array(buffer)[0] = 7;
    const plugin = {
      export: async (_song: unknown) => buffer,
    };
    const payload = normalizeExporterResult(await plugin.export(song));
    expect(payload?.data).toEqual(new Uint8Array([7]));
  });
});
