import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';
import { buildJSON } from '../src/export/jsonExport';
import { buildMIDI } from '../src/export/midiExport';
import { buildWAV } from '../src/export/wavWriter';
import {
  jsonExporterPlugin,
  midiExporterPlugin,
  wavExporterPlugin,
} from '../src/export/plugins/index';

describe('export payload builders', () => {
  const source = `
chip gameboy
bpm 120

inst lead type=pulse1 duty=50 env={"level":10,"direction":"down","period":1,"format":"gb"}

pat melody = C5 E5 G5
channel 1 => inst lead pat melody
`;

  test('buildJSON returns ISM wrapper JSON for a resolved song', () => {
    const ast = parse(source);
    const song = resolveSong(ast as any);
    const json = buildJSON(song);
    const obj = JSON.parse(json);
    expect(obj.version).toBe(1);
    expect(obj.song).toBeDefined();
    expect(Array.isArray(obj.song.channels)).toBe(true);
    expect(obj.exportedAt).toBeDefined();
  });

  test('buildMIDI returns a Standard MIDI File header', () => {
    const ast = parse(source);
    const song = resolveSong(ast as any);
    const midi = buildMIDI(song);
    expect(midi.byteLength).toBeGreaterThan(14);
    expect(String.fromCharCode(midi[0], midi[1], midi[2], midi[3])).toBe('MThd');
  });

  test('buildWAV returns a RIFF WAV payload', () => {
    const samples = new Float32Array([0, 0.25, -0.25, 0.5]);
    const wav = buildWAV(samples, { sampleRate: 44100, bitDepth: 16, channels: 2 });
    expect(wav.byteLength).toBeGreaterThan(44);
    expect(String.fromCharCode(wav[0], wav[1], wav[2], wav[3])).toBe('RIFF');
    expect(String.fromCharCode(wav[8], wav[9], wav[10], wav[11])).toBe('WAVE');
  });
});

describe('built-in exporter plugins without outputPath', () => {
  test('jsonExporterPlugin returns JSON string', async () => {
    const ast = parse(`
chip gameboy
pat p = C5
channel 1 => pat p
`);
    const song = resolveSong(ast as any);
    const result = await jsonExporterPlugin.export(song);
    expect(typeof result).toBe('string');
    expect(JSON.parse(result as string).song).toBeDefined();
  });

  test('midiExporterPlugin returns Uint8Array', async () => {
    const ast = parse(`
chip gameboy
pat p = C5
channel 1 => pat p
`);
    const song = resolveSong(ast as any);
    const result = await midiExporterPlugin.export(song);
    expect(result).toBeInstanceOf(Uint8Array);
    expect((result as Uint8Array).byteLength).toBeGreaterThan(0);
  });

  test('wavExporterPlugin returns Uint8Array for songs with events', async () => {
    const ast = parse(`
chip gameboy
inst lead type=pulse1 duty=50 env={"level":10,"direction":"down","period":1,"format":"gb"}
pat p = C5
channel 1 => inst lead pat p
`);
    const song = resolveSong(ast as any);
    const result = await wavExporterPlugin.export(song, { sampleRate: 44100 });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(String.fromCharCode(
      (result as Uint8Array)[0],
      (result as Uint8Array)[1],
      (result as Uint8Array)[2],
      (result as Uint8Array)[3],
    )).toBe('RIFF');
  });

  test('wavExporterPlugin validate rejects empty songs', () => {
    const errors = wavExporterPlugin.validate?.({ channels: [{ id: 1, events: [] }] } as any);
    expect(errors).toEqual(['Song has no audio events to export.']);
  });
});
