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
import type { MidiConvertOptions, MidiRawNote, PackedHit } from '../../../src/import/midi/types';

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
  });

  test('parseImportConfig validates trackMappings', () => {
    const cfg = parseImportConfig({
      chip: 'gameboy',
      trackMappings: [{ midiTrack: 0, target: 'pulse1', instrument: 'lead' }],
    });
    expect(cfg.trackMappings?.[0]?.target).toBe('pulse1');
    expect(() => parseImportConfig([])).toThrow(/JSON object/);
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

  test('strict mode fails off-grid', () => {
    const diags: any[] = [];
    const opts: MidiConvertOptions = {
      ...base,
      quantize: { mode: 'strict', grid: '1/16', maxShiftTicks: 1 },
    };
    expect(() => quantizePosition(1.3, opts, diags, 'off')).toThrow(/Strict quantize/);
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
    expect(mapDrumPitch(38)).toBe('snare');
    expect(mapDrumPitch(42)).toBe('hihat');
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
