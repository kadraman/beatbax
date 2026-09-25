import {
  defaultConvertOptions,
  gridToTicks,
  parseChipId,
  parseImportConfig,
  parseQuantizeGrid,
  parseQuantizeMode,
  resolveConvertOptions,
} from '../../../src/import/midi/config';
import { midiTicksToBaxTicks, quantizeNotes, quantizePosition } from '../../../src/import/midi/quantize';
import { mapDrumPitch, DEFAULT_DRUM_MAP } from '../../../src/import/midi/roles';
import { compressPlaylist, hitsToBarTokens, hashTokens } from '../../../src/import/midi/reuse';
import type {
  ConversionDiagnostic,
  MidiConvertOptions,
  MidiRawNote,
  PackedHit,
} from '../../../src/import/midi/types';

describe('midi import config', () => {
  test('parses chip and quantize enums', () => {
    expect(parseChipId('gameboy')).toBe('gameboy');
    expect(parseChipId('nes')).toBe('nes');
    expect(() => parseChipId('sms')).toThrow(/Unsupported/);
    expect(parseQuantizeMode('nearest')).toBe('nearest');
    expect(parseQuantizeMode('strict')).toBe('strict');
    expect(parseQuantizeGrid('1/16')).toBe('1/16');
    expect(() => parseQuantizeGrid('1/3')).toThrow(/Invalid quantize grid/);
  });

  test('gridToTicks at ticksPerBeat=4', () => {
    expect(gridToTicks('1/4', 4)).toBe(4);
    expect(gridToTicks('1/8', 4)).toBe(2);
    expect(gridToTicks('1/16', 4)).toBe(1);
    expect(gridToTicks('1/32', 4)).toBe(1);
  });

  test('parseImportConfig accepts programFamilies and families', () => {
    const cfg = parseImportConfig({
      programFamilies: { '0-7': 'piano', '56': 'lead' },
      families: { piano: { gb: { period: 1 } } },
    });
    expect(cfg.programFamilies?.['0-7']).toBe('piano');
    expect(cfg.families?.piano?.gb?.period).toBe(1);
    expect(() => parseImportConfig({ programFamilies: { '0-7': 'trumpet' } })).toThrow(/piano\|guitar/);
    expect(() => parseImportConfig({ programFamilies: { '200': 'piano' } })).toThrow(/0 ≤ min/);
  });

  test('resolveConvertOptions merges config and CLI', () => {
    const opts = resolveConvertOptions({
      chip: 'nes',
      config: {
        ticksPerBeat: 4,
        quantize: { mode: 'floor', grid: '1/8' },
        dmcReinforcement: { enabled: true },
      },
      quantize: 'ceil',
      maxOverlapTicks: 2,
    });
    expect(opts.chip).toBe('nes');
    expect(opts.quantize.mode).toBe('ceil'); // CLI wins
    expect(opts.quantize.grid).toBe('1/8');
    expect(opts.maxOverlapTicks).toBe(2);
    expect(opts.dmcReinforcement.enabled).toBe(true);
    expect(opts.programFamilyByProgram).toHaveLength(128);
    expect(opts.familyArticulations.piano.gb.period).toBe(2);
  });

  test('resolveConvertOptions reads drumFlamTicks from config', () => {
    const opts = resolveConvertOptions({
      chip: 'gameboy',
      config: { drumFlamTicks: 2 },
    });
    expect(opts.drumFlamTicks).toBe(2);
    expect(defaultConvertOptions('gameboy').drumFlamTicks).toBe(0);
    expect(parseImportConfig({ drumFlamTicks: 1 }).drumFlamTicks).toBe(1);
  });

  test('parseImportConfig validates trackMappings', () => {
    const cfg = parseImportConfig({
      chip: 'gameboy',
      trackMappings: [
        { midiTrack: 0, target: 'pulse1', instrument: 'lead' },
        { midiChannel: 10, target: 'noise' },
        { midiChannel: 0, target: 'pulse2' },
        { midiChannel: 16, target: 'wave' },
      ],
    });
    expect(cfg.trackMappings?.[0]?.target).toBe('pulse1');
    expect(cfg.trackMappings?.[1]?.midiChannel).toBe(10);
    expect(cfg.trackMappings?.[2]?.midiChannel).toBe(0);
    expect(cfg.trackMappings?.[3]?.midiChannel).toBe(16);
    expect(() => parseImportConfig([])).toThrow(/JSON object/);
  });

  test('parseImportConfig rejects invalid trackMapping target', () => {
    expect(() =>
      parseImportConfig({
        trackMappings: [{ midiTrack: 0, target: 'pulze1' }],
      }),
    ).toThrow(/trackMappings\[0\]\.target/);
    expect(() =>
      parseImportConfig({
        trackMappings: [{ midiTrack: 0, target: 'bass' }],
      }),
    ).toThrow(/pulse1\|pulse2\|wave\|triangle\|noise\|dmc/);
  });

  test('parseImportConfig rejects invalid trackMapping midiChannel', () => {
    expect(() =>
      parseImportConfig({
        trackMappings: [{ midiChannel: 17, target: 'pulse1' }],
      }),
    ).toThrow(/trackMappings\[0\]\.midiChannel/);
    expect(() =>
      parseImportConfig({
        trackMappings: [{ midiChannel: -1, target: 'pulse1' }],
      }),
    ).toThrow(/0–15 \(0-based\) or 1–16 \(1-based\)/);
    expect(() =>
      parseImportConfig({
        trackMappings: [{ midiChannel: 1.5, target: 'pulse1' }],
      }),
    ).toThrow(/midiChannel/);
    expect(() =>
      parseImportConfig({
        trackMappings: [{ midiChannel: '9', target: 'pulse1' }],
      }),
    ).toThrow(/midiChannel/);
  });
});

describe('midi quantize', () => {
  const base: MidiConvertOptions = defaultConvertOptions('gameboy');

  test('midiTicksToBaxTicks PPQ 480 → ticksPerBeat 4', () => {
    expect(midiTicksToBaxTicks(480, 480, 4)).toBe(4);
    expect(midiTicksToBaxTicks(120, 480, 4)).toBe(1);
  });

  test('nearest / floor / ceil modes', () => {
    const diags: any[] = [];
    expect(quantizePosition(1.4, { ...base, quantize: { ...base.quantize, mode: 'nearest' } }, diags, 't').tick).toBe(1);
    expect(quantizePosition(1.4, { ...base, quantize: { ...base.quantize, mode: 'floor' } }, diags, 't').tick).toBe(1);
    expect(quantizePosition(1.4, { ...base, quantize: { ...base.quantize, mode: 'ceil' } }, diags, 't').tick).toBe(2);
  });

  test('strict mode records error; throws only when options.strict', () => {
    const diags: ConversionDiagnostic[] = [];
    const opts: MidiConvertOptions = {
      ...base,
      quantize: { mode: 'strict', grid: '1/16', maxShiftTicks: 1 },
      strict: false,
    };
    const result = quantizePosition(1.3, opts, diags, 'off');
    expect(diags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'error', code: 'quantize_strict' }),
      ]),
    );
    expect(result.tick).toBe(1);

    const diags2: ConversionDiagnostic[] = [];
    expect(() =>
      quantizePosition(1.3, { ...opts, strict: true }, diags2, 'off'),
    ).toThrow(/Strict quantize/);
    expect(diags2.some((d) => d.code === 'quantize_strict')).toBe(true);
  });

  test('quantizeNotes sorts deterministically', () => {
    const notes: MidiRawNote[] = [
      {
        startMidiTicks: 240,
        durationMidiTicks: 120,
        pitch: 64,
        velocity: 80,
        midiChannel: 0,
        sourceTrackIndex: 1,
        sourceEventIndex: 0,
        trackName: 'a',
        program: 81,
        isDrum: false,
      },
      {
        startMidiTicks: 0,
        durationMidiTicks: 120,
        pitch: 60,
        velocity: 100,
        midiChannel: 0,
        sourceTrackIndex: 0,
        sourceEventIndex: 0,
        trackName: 'a',
        program: 81,
        isDrum: false,
      },
    ];
    const q = quantizeNotes(notes, 480, base, []);
    expect(q[0]!.pitch).toBe(60);
    expect(q[0]!.startTick).toBe(0);
    expect(q[1]!.startTick).toBe(2);
  });
});

describe('drum map', () => {
  test('inverts export GM notes to named tokens', () => {
    expect(mapDrumPitch(36)).toBe('kick');
    expect(mapDrumPitch(37)).toBe('ghost');
    expect(mapDrumPitch(38)).toBe('snare');
    expect(mapDrumPitch(39)).toBe('snare');
    expect(mapDrumPitch(42)).toBe('hihat');
    expect(mapDrumPitch(49)).toBe('crash');
    expect(DEFAULT_DRUM_MAP[36]).toBe('kick');
  });
});

describe('reuse helpers', () => {
  test('hitsToBarTokens pads rests to patternTicks', () => {
    const hits: PackedHit[] = [{ startTick: 4, durationTicks: 2, token: 'C4', velocity: 100 }];
    const tokens = hitsToBarTokens(hits, 0, 16);
    expect(tokens[0]).toBe('.:4');
    expect(tokens).toContain('C4:2');
    const sum = tokens.reduce((s, t) => {
      if (t.startsWith('inst(')) return s;
      const m = t.match(/:(\d+)$/);
      return s + (m ? parseInt(m[1], 10) : 1);
    }, 0);
    expect(sum).toBe(16);
  });

  test('compressPlaylist emits *N', () => {
    expect(compressPlaylist(['a', 'a', 'a', 'b', 'b'])).toEqual(['a*3', 'b*2']);
  });

  test('hashTokens is stable', () => {
    expect(hashTokens(['C4', '.', 'E4'])).toBe(hashTokens(['C4', '.', 'E4']));
  });
});
