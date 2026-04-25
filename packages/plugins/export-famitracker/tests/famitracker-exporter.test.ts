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

  test('text exporter warns when a pattern has a non-power-of-2 row count', async () => {
    // 17 events with sourcePattern 'bad_pat' → frame length 17 (not a power of 2)
    const events = Array.from({ length: 17 }, (_, i) => ({
      type: i === 0 ? 'note' : 'sustain',
      token: 'C4',
      sourcePattern: 'bad_pat',
    }));
    const warnMessages: string[] = [];
    const song: any = {
      chip: 'nes',
      bpm: 120,
      channels: [{ id: 1, events }],
      pats: { bad_pat: Array(17).fill('C4') },
      metadata: { name: 'warn test' },
    };
    await famitrackerTextExporterPlugin.export(song, { onWarn: (m: string) => warnMessages.push(m) } as any);
    expect(warnMessages.some((m) => m.includes('"bad_pat"') && m.includes('17 rows'))).toBe(true);
  });

  test('text exporter does not warn for power-of-2 pattern lengths', async () => {
    const events = Array.from({ length: 16 }, (_, i) => ({
      type: i === 0 ? 'note' : 'sustain',
      token: 'C4',
      sourcePattern: 'good_pat',
    }));
    const warnMessages: string[] = [];
    const song: any = {
      chip: 'nes',
      bpm: 120,
      channels: [{ id: 1, events }],
      pats: { good_pat: Array(16).fill('C4') },
      metadata: { name: 'no warn test' },
    };
    await famitrackerTextExporterPlugin.export(song, { onWarn: (m: string) => warnMessages.push(m) } as any);
    expect(warnMessages.some((m) => m.includes('not a power of 2'))).toBe(false);
  });
});
