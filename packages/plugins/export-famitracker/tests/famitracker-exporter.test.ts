import {
  famitrackerTextExporterPlugin,
} from '../src/index.js';

describe('famitracker exporter plugins', () => {
  const nesSong: any = {
    chip: 'nes',
    bpm: 120,
    channels: [{ id: 1, events: [] }],
    metadata: { name: 'test song' },
  };

  test('text exporter returns .txt payload', async () => {
    const data = await famitrackerTextExporterPlugin.export(nesSong);
    expect(typeof data).toBe('string');
    expect(String(data)).toContain('FamiTracker text export');
    expect(String(data)).toContain('TITLE');
    expect(famitrackerTextExporterPlugin.extension).toBe('txt');
  });

  test('text exporter rejects non-NES songs via validate()', () => {
    const gbSong: any = { chip: 'gameboy', channels: [] };
    expect(famitrackerTextExporterPlugin.validate?.(gbSong).length).toBeGreaterThan(0);
  });
});
