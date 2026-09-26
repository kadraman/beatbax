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
import { mapDrumPitch, DEFAULT_DRUM_MAP, classifyStreams } from '../../../src/import/midi/roles';
import { packChannels } from '../../../src/import/midi/pack';
import { compressPlaylist, hitsToBarTokens, hashTokens, sectionCountForBars, buildPatternsAndSequences } from '../../../src/import/midi/reuse';
import type {
  ConversionDiagnostic,
  MidiConvertOptions,
  MidiRawNote,
  PackedChannel,
  PackedHit,
  QuantizedNote,
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

  test('parseImportConfig rejects invalid family articulation values', () => {
    expect(() =>
      parseImportConfig({ families: { piano: { gb: { period: 'bad' } } } }),
    ).toThrow(/families\.piano\.gb\.period/);
    expect(() =>
      parseImportConfig({ families: { piano: { gb: { dutyP1: 13 } } } }),
    ).toThrow(/12\.5\|25\|50\|75/);
    expect(() =>
      parseImportConfig({ families: { piano: { gb: { level: 16 } } } }),
    ).toThrow(/0–15/);
    expect(() =>
      parseImportConfig({ families: { piano: { gb: { waveVolume: 33 } } } }),
    ).toThrow(/0\|25\|50\|100/);
    expect(() =>
      parseImportConfig({ families: { lead: { nes: { vol: Number.NaN } } } }),
    ).toThrow(/families\.lead\.nes\.vol/);
    expect(() =>
      parseImportConfig({ families: { lead: { nes: { dutyP2: 60 } } } }),
    ).toThrow(/12\.5\|25\|50\|75/);
    expect(() =>
      parseImportConfig({ families: { lead: { nes: { volEnv: [1, 'x'] } } } }),
    ).toThrow(/volEnv\[1\]/);
    expect(() =>
      parseImportConfig({ families: { lead: { nes: { pitchEnvP1: [1.5] } } } }),
    ).toThrow(/pitchEnvP1\[0\]/);
    const ok = parseImportConfig({
      families: {
        piano: { gb: { period: 0, level: 10, dutyP1: 12.5, waveVolume: 50 } },
        lead: { nes: { vol: 8, dutyP1: 25, volEnv: [12, 6, 0], pitchEnvP1: [2, 1, 0] } },
      },
    });
    expect(ok.families?.piano?.gb?.dutyP1).toBe(12.5);
    expect(ok.families?.lead?.nes?.volEnv).toEqual([12, 6, 0]);
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

  test('parseImportConfig rejects invalid sectionBars', () => {
    expect(() => parseImportConfig({ sectionBars: -1 })).toThrow(/sectionBars/);
    expect(() => parseImportConfig({ sectionBars: 1.5 })).toThrow(/sectionBars/);
    expect(parseImportConfig({ sectionBars: 0 }).sectionBars).toBe(0);
    expect(parseImportConfig({ sectionBars: 8 }).sectionBars).toBe(8);
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

  test('parseImportConfig rejects invalid trackMapping instrument identifiers', () => {
    expect(() =>
      parseImportConfig({
        trackMappings: [{ midiTrack: 0, target: 'pulse1', instrument: 'soft lead' }],
      }),
    ).toThrow(/trackMappings\[0\]\.instrument/);
    expect(() =>
      parseImportConfig({
        trackMappings: [{ midiTrack: 0, target: 'pulse1', instrument: '1lead' }],
      }),
    ).toThrow(/BeatBax identifier/);
    const ok = parseImportConfig({
      trackMappings: [{ midiTrack: 0, target: 'pulse1', instrument: 'soft_lead' }],
    });
    expect(ok.trackMappings?.[0]?.instrument).toBe('soft_lead');
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

  test('maxShiftTicks clamp does not requantize past the guardrail', () => {
    const diags: ConversionDiagnostic[] = [];
    // Continuous 2 on a 4-tick nearest grid wants 4 (shift 2); maxShiftTicks=1 must stay at 3.
    const opts: MidiConvertOptions = {
      ...base,
      ticksPerBeat: 4,
      quantize: { mode: 'nearest', grid: '1/4', maxShiftTicks: 1 },
    };
    const result = quantizePosition(2, opts, diags, 'mid');
    expect(diags.some((d) => d.code === 'quantize_clamp')).toBe(true);
    expect(result.tick).toBe(3);
    expect(Math.abs(result.shift)).toBeLessThanOrEqual(1 + 1e-6);
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

  test('custom trackMapping drumMap overrides default tokens through pack', () => {
    const opts = resolveConvertOptions({
      chip: 'nes',
      config: parseImportConfig({
        trackMappings: [
          {
            midiTrack: 0,
            target: 'noise',
            drumMap: { '36': 'kick', '39': 'hihat' },
          },
        ],
      }),
    });
    const notes: QuantizedNote[] = [
      {
        startTick: 0,
        durationTicks: 1,
        pitch: 39,
        velocity: 100,
        midiChannel: 9,
        sourceTrackIndex: 0,
        sourceEventIndex: 0,
        trackName: 'drums',
        program: 0,
        isDrum: true,
        shiftTicks: 0,
      },
    ];
    const diags: ConversionDiagnostic[] = [];
    const streams = classifyStreams(notes, opts, diags);
    expect(streams[0]?.drumMap?.['39']).toBe('hihat');
    const { channels } = packChannels(streams, opts, diags);
    const noise = channels.find((c) => c.role === 'noise');
    expect(noise?.hits.map((h) => h.token)).toEqual(['hihat']);
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

  test('sectionCountForBars respects sectionBars and short-song rule', () => {
    expect(sectionCountForBars(16, 8)).toBe(2);
    expect(sectionCountForBars(8, 8)).toBe(1);
    expect(sectionCountForBars(9, 8)).toBe(2);
    expect(sectionCountForBars(32, 0)).toBe(1);
  });

  test('buildPatternsAndSequences chunks aligned section seqs', () => {
    const mkHits = (pitch: number): PackedHit[] => {
      const hits: PackedHit[] = [];
      for (let bar = 0; bar < 16; bar++) {
        hits.push({
          startTick: bar * 16,
          durationTicks: 4,
          token: pitch === 36 ? 'C2' : 'C4',
          velocity: 100,
        });
      }
      return hits;
    };
    const channels: PackedChannel[] = [
      {
        channelIndex: 1,
        role: 'pulse1',
        defaultInstrument: 'lead_p1',
        hits: mkHits(60),
      },
      {
        channelIndex: 3,
        role: 'wave',
        defaultInstrument: 'bass',
        hits: mkHits(36),
      },
    ];
    const opts = defaultConvertOptions('gameboy');
    expect(opts.sectionBars).toBe(8);
    const reuse = buildPatternsAndSequences(channels, opts, []);
    expect(reuse.sectionCount).toBe(2);
    expect(reuse.channelPlans.map((c) => c.sequenceNames)).toEqual([
      ['lead_s01', 'lead_s02'],
      ['bass_s01', 'bass_s02'],
    ]);
    expect(reuse.sequences.find((s) => s.name === 'lead_s01')?.playlist).toHaveLength(8);
    expect(reuse.sequences.find((s) => s.name === 'lead_s02')?.playlist).toHaveLength(8);

    const mono = buildPatternsAndSequences(channels, { ...opts, sectionBars: 0 }, []);
    expect(mono.sectionCount).toBe(1);
    expect(mono.channelPlans[0]?.sequenceNames).toEqual(['lead_seq']);
  });
});
