import {
  famitrackerBinaryExporterPlugin,
  famitrackerTextExporterPlugin,
} from '../src/index.js';

describe('famitracker exporter plugins', () => {
  const nesSong: any = {
    chip: 'nes',
    bpm: 120,
    channels: [{ id: 1, events: [] }],
    metadata: { name: 'test song' },
  };

  test('binary exporter returns .ftm payload', () => {
    const data = famitrackerBinaryExporterPlugin.export(nesSong) as Uint8Array;
    expect(data).toBeInstanceOf(Uint8Array);
    expect(famitrackerBinaryExporterPlugin.extension).toBe('ftm');
  });

  test('text exporter returns .txt payload', () => {
    const data = famitrackerTextExporterPlugin.export(nesSong);
    expect(typeof data).toBe('string');
    expect(String(data)).toContain('FamiTracker text export');
    expect(String(data)).toContain('TITLE');
    expect(famitrackerTextExporterPlugin.extension).toBe('txt');
  });

  test('both exporters reject non-NES songs via validate()', () => {
    const gbSong: any = { chip: 'gameboy', channels: [] };
    expect(famitrackerBinaryExporterPlugin.validate?.(gbSong).length).toBeGreaterThan(0);
    expect(famitrackerTextExporterPlugin.validate?.(gbSong).length).toBeGreaterThan(0);
  });
});
