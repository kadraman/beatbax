import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  arkosExporterPlugin,
  exportArkos,
  lowerToArkos,
  noteToArkos,
  serializeAks,
  validateArkosExport,
} from '../src/index.js';
import { deriveInitialSpeed } from '../src/arkos-lowering.js';

function makeBasicSong(overrides: Record<string, unknown> = {}): any {
  return {
    chip: 'spectrum-128',
    bpm: 120,
    pats: {
      riff_a: ['C4', 'D4', 'E4', 'F4'],
      riff_b: ['C3', 'D3', 'E3', 'F3'],
      riff_c: ['C2', 'D2', 'E2', 'F2'],
    },
    insts: {
      tone1: { type: 'tone1', vol: 10 },
      tone2: { type: 'tone2', vol: 10 },
      tone3: { type: 'tone3', vol: 10 },
    },
    seqs: {},
    channels: [
      {
        id: 1,
        defaultInstrument: 'tone1',
        events: [
          { type: 'note', token: 'C4', instrument: 'tone1', sourcePattern: 'riff_a' },
          { type: 'note', token: 'D4', instrument: 'tone1', sourcePattern: 'riff_a' },
          { type: 'note', token: 'E4', instrument: 'tone1', sourcePattern: 'riff_a' },
          { type: 'note', token: 'F4', instrument: 'tone1', sourcePattern: 'riff_a' },
        ],
      },
      {
        id: 2,
        defaultInstrument: 'tone2',
        events: [
          { type: 'note', token: 'C3', instrument: 'tone2', sourcePattern: 'riff_b' },
          { type: 'note', token: 'D3', instrument: 'tone2', sourcePattern: 'riff_b' },
          { type: 'note', token: 'E3', instrument: 'tone2', sourcePattern: 'riff_b' },
          { type: 'note', token: 'F3', instrument: 'tone2', sourcePattern: 'riff_b' },
        ],
      },
      {
        id: 3,
        defaultInstrument: 'tone3',
        events: [
          { type: 'note', token: 'C2', instrument: 'tone3', sourcePattern: 'riff_c' },
          { type: 'note', token: 'D2', instrument: 'tone3', sourcePattern: 'riff_c' },
          { type: 'note', token: 'E2', instrument: 'tone3', sourcePattern: 'riff_c' },
          { type: 'note', token: 'F2', instrument: 'tone3', sourcePattern: 'riff_c' },
        ],
      },
    ],
    metadata: { name: 'AY Synth Channels', artist: 'The BeatBax Team' },
    ...overrides,
  };
}

describe('arkos exporter', () => {
  test('noteToArkos maps C4 to 48 and A4 to 57', () => {
    expect(noteToArkos('C4')).toBe(48);
    expect(noteToArkos('A4')).toBe(57);
    expect(noteToArkos('C4:8')).toBe(48);
  });

  test('deriveInitialSpeed uses 16th-note grid at 50 Hz', () => {
    expect(deriveInitialSpeed(120)).toBe(6);
  });

  test('validate accepts spectrum-128 basic song', () => {
    expect(validateArkosExport(makeBasicSong())).toEqual([]);
  });

  test('validate accepts cpc alias', () => {
    expect(validateArkosExport(makeBasicSong({ chip: 'cpc' }))).toEqual([]);
  });

  test('validate rejects non-spectrum chips', () => {
    const errors = validateArkosExport(makeBasicSong({ chip: 'nes' }));
    expect(errors.some((e) => e.includes('Spectrum/CPC'))).toBe(true);
  });

  test('validate rejects arp_env in v1', () => {
    const song = makeBasicSong({
      insts: {
        lead: { type: 'tone1', vol: 12, arp_env: [0, 4, 7] },
      },
    });
    const errors = validateArkosExport(song);
    expect(errors.some((e) => e.includes('arp_env'))).toBe(true);
  });

  test('validate rejects inline effects in v1', () => {
    const song = makeBasicSong();
    song.channels[0].events[0].effects = [{ type: 'vib', params: [4, 4] }];
    const errors = validateArkosExport(song);
    expect(errors.some((e) => e.includes('inline effects'))).toBe(true);
  });

  test('validate rejects named events without usable defaultNote', () => {
    const song = makeBasicSong({
      insts: {
        kick: { type: 'tone1', vol: 12 },
      },
      channels: [
        {
          id: 1,
          defaultInstrument: 'kick',
          events: [
            { type: 'named', token: 'kick', instrument: 'kick', sourcePattern: 'riff_a' },
          ],
        },
      ],
    });
    const errors = validateArkosExport(song);
    expect(errors.some((e) => e.includes('defaultNote') && e.includes('kick'))).toBe(
      true,
    );
  });

  test('validate accepts named events with defaultNote', () => {
    const song = makeBasicSong({
      insts: {
        kick: { type: 'tone1', vol: 12, note: 'C2' },
      },
      channels: [
        {
          id: 1,
          defaultInstrument: 'kick',
          events: [
            {
              type: 'named',
              token: 'kick',
              instrument: 'kick',
              defaultNote: 'C2',
              sourcePattern: 'riff_a',
            },
          ],
        },
      ],
    });
    expect(validateArkosExport(song)).toEqual([]);
  });

  test('lower + serialize produces deterministic AT3 XML', () => {
    const song = makeBasicSong();
    const a = serializeAks(lowerToArkos(song));
    const b = serializeAks(lowerToArkos(song));
    expect(a).toBe(b);
    expect(a).toContain('formatVersion');
    expect(a).toContain('>3.0<');
    expect(a).toContain('<title>AY Synth Channels</title>');
    expect(a).toContain('<type>ay</type>');
    expect(a).toContain('<frequencyHz>1773400</frequencyHz>');
    expect(a).toContain('<note>48</note>'); // C4
    expect(a).toContain('<name>Empty</name>');
    expect(a).toContain('<name>tone1</name>');
    // AT3 requires non-empty arpeggios/pitches expression tables
    expect(a).toContain('<arpeggios>');
    expect(a).toContain('<pitches>');
    expect(a).not.toContain('<pitchTables');
    expect(a).toContain('<isArpeggio>true</isArpeggio>');
    expect(a).toContain('<isArpeggio>false</isArpeggio>');
    // PositionSerializer rejects bare <transposition>0</transposition>
    expect(a).toContain('<transpositions/>');
    expect(a).not.toMatch(/<transposition>\s*0\s*<\/transposition>/);
    expect(a).toContain('<digiChannel>1</digiChannel>');
    expect(a).toContain('<speedTracks/>');
    expect(a).toContain('<eventTracks/>');
    // Canonical Empty instrument
    expect(a).toMatch(/<name>Empty<\/name>[\s\S]*?<speed>255<\/speed>/);
  });

  test('cpc songs use 1 MHz AY clock', () => {
    const xml = serializeAks(lowerToArkos(makeBasicSong({ chip: 'cpc' })));
    expect(xml).toContain('<frequencyHz>1000000</frequencyHz>');
  });

  test('export without outputPath returns aks payload', async () => {
    const payload = await exportArkos(makeBasicSong());
    expect(payload).toBeTruthy();
    expect(typeof (payload as any).data).toBe('string');
    expect((payload as any).filename).toMatch(/\.aks$/);
    expect((payload as any).filename).toBe(
      String((payload as any).filename).toLowerCase(),
    );
    expect(String((payload as any).data)).toContain('<song');
  });

  test('plugin metadata exposes a known toolbar icon', () => {
    expect(arkosExporterPlugin.uiContributions?.toolbarIcon).toBe('document-text');
    expect(arkosExporterPlugin.uiContributions?.toolbarLabel).toBe('AKS');
  });

  test('export with outputPath writes .aks only by default', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'beatbax-arkos-'));
    const out = join(dir, 'song.aks');
    const result = await exportArkos(makeBasicSong(), { outputPath: out });
    expect(result).toBeUndefined();
    expect(existsSync(out)).toBe(true);
    expect(existsSync(join(dir, 'song.aki'))).toBe(false);
    expect(readFileSync(out, 'utf8')).toContain('<subsongs>');
  });

  test('export with instrumentBank writes .aki only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'beatbax-arkos-aki-'));
    const out = join(dir, 'song.aki');
    const result = await exportArkos(makeBasicSong(), {
      outputPath: out,
      instrumentBank: true,
    });
    expect(result).toBeUndefined();
    expect(existsSync(out)).toBe(true);
    expect(existsSync(join(dir, 'song.aks'))).toBe(false);
    const aki = readFileSync(out, 'utf8');
    expect(aki).toContain('<name>tone1</name>');
    expect(aki).toContain('<subsongs/>');
  });

  test('instrumentBank payload uses .aki filename', async () => {
    const payload = await exportArkos(makeBasicSong(), { instrumentBank: true });
    expect((payload as any).filename).toMatch(/\.aki$/);
    expect(String((payload as any).data)).toContain('BeatBax Instrument Bank');
  });

  test('plugin metadata', () => {
    expect(arkosExporterPlugin.id).toBe('arkos');
    expect(arkosExporterPlugin.extension).toBe('aks');
    expect(arkosExporterPlugin.supportedChips).toContain('spectrum-128');
    expect(arkosExporterPlugin.supportedChips).toContain('cpc');
  });

  test('noise-only instrument maps to noSoftwareNoHardware', () => {
    const song = makeBasicSong({
      insts: {
        hat: { type: 'tone1', vol: 12, noise_rate: 8, tone_mix: true },
      },
      channels: [
        {
          id: 1,
          defaultInstrument: 'hat',
          events: [
            { type: 'note', token: 'C4', instrument: 'hat', sourcePattern: 'riff_a' },
            { type: 'rest', sourcePattern: 'riff_a' },
            { type: 'rest', sourcePattern: 'riff_a' },
            { type: 'rest', sourcePattern: 'riff_a' },
          ],
        },
      ],
    });
    const model = lowerToArkos(song);
    const hat = model.instruments.find((i) => i.name === 'hat');
    expect(hat).toBeTruthy();
    expect(hat!.cells[0].link).toBe('noSoftwareNoHardware');
    expect(hat!.cells[0].noise).toBe(8);
  });

  test('tone instruments loop a single sustain cell (BeatBax constant vol)', () => {
    const model = lowerToArkos(makeBasicSong());
    const tone1 = model.instruments.find((i) => i.name === 'tone1');
    expect(tone1).toBeTruthy();
    expect(tone1!.cells).toHaveLength(1);
    expect(tone1!.cells[0].volume).toBe(10);
    expect(tone1!.cells[0].link).toBe('softwareOnly');
    expect(tone1!.isLooping).toBe(true);
    expect(tone1!.loopStartIndex).toBe(0);
    expect(tone1!.endIndex).toBe(0);
  });

  test('named events use defaultNote, not instrument-name token', () => {
    const song = makeBasicSong({
      insts: {
        kick: { type: 'tone1', vol: 12, note: 'C2' },
      },
      channels: [
        {
          id: 1,
          defaultInstrument: 'kick',
          events: [
            {
              type: 'named',
              token: 'kick',
              instrument: 'kick',
              defaultNote: 'C2',
              sourcePattern: 'riff_a',
            },
            { type: 'rest', sourcePattern: 'riff_a' },
            { type: 'rest', sourcePattern: 'riff_a' },
            { type: 'rest', sourcePattern: 'riff_a' },
          ],
        },
      ],
    });
    const xml = serializeAks(lowerToArkos(song));
    // C2 → Arkos note 24; must not silently become rest (255) from token "kick"
    expect(xml).toContain('<note>24</note>');
    expect(xml).toContain('<name>kick</name>');
    const model = lowerToArkos(song);
    const cell = model.subsongs[0].tracks[0].cells.find((c) => c.note !== 255);
    expect(cell?.note).toBe(24);
    expect(cell?.instrument).toBe(1); // Empty=0, kick=1
  });
});
