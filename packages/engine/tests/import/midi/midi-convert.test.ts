import { Midi } from '@tonejs/midi';
import {
  convertMidiParseResult,
  convertMidiToBax,
  defaultConvertOptions,
  parseImportConfig,
  resolveConvertOptions,
} from '../../../src/import/midi';
import { classifyStreams } from '../../../src/import/midi/roles';
import { packChannels } from '../../../src/import/midi/pack';
import { readMidiBytes, resolveNoteMidiChannel } from '../../../src/import/midi/reader';
import type { MidiParseResult, QuantizedNote } from '../../../src/import/midi/types';
import { parse } from '../../../src/parser/index';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function expectParses(source: string) {
  const ast = parse(source);
  expect(ast).toBeTruthy();
  expect(ast.channels?.length ?? 0).toBeGreaterThan(0);
}

function makeMidi(builder: (midi: Midi) => void): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  builder(midi);
  return midi.toArray();
}

describe('midi reader channel resolution', () => {
  test('resolveNoteMidiChannel prefers note.channel over track.channel', () => {
    expect(resolveNoteMidiChannel({ channel: 2 }, 0)).toBe(2);
    expect(resolveNoteMidiChannel({}, 1)).toBe(1);
    expect(resolveNoteMidiChannel({ channel: undefined }, 9)).toBe(9);
  });

  test('F09 format-0 notes keep distinct midi channels', () => {
    const bytes = readFileSync(join(__dirname, '../../fixtures/midi/f09-format0.mid'));
    const parsed = readMidiBytes(bytes);
    const channels = [...new Set(parsed.notes.map((n) => n.midiChannel))].sort((a, b) => a - b);
    expect(parsed.notes).toHaveLength(4);
    expect(channels).toEqual([0, 1, 2]);
  });
});

describe('midi reader + convert smoke', () => {
  test('reads format-1 style tracks and converts to .bax', () => {
    const bytes = makeMidi((midi) => {
      const t = midi.addTrack();
      t.name = 'Lead';
      t.channel = 0;
      t.instrument.number = 81;
      t.addNote({ midi: 60, time: 0, duration: 0.25, velocity: 0.8 });
      t.addNote({ midi: 64, time: 0.25, duration: 0.25, velocity: 0.8 });
      t.addNote({ midi: 67, time: 0.5, duration: 0.5, velocity: 0.8 });
    });

    const parsed = readMidiBytes(bytes);
    expect(parsed.notes.length).toBe(3);
    expect(parsed.ppq).toBeGreaterThan(0);

    const result = convertMidiToBax(bytes, defaultConvertOptions('gameboy'), 'smoke.mid');
    expect(result.source).toContain('chip gameboy');
    expect(result.source).toContain('inst lead');
    expect(result.source).toContain('pat ');
    expect(result.source).toContain('channel 1');
    expect(result.source).toContain('play');
    expect(result.summary.notesImported).toBe(3);
  });

  test('determinism: same input → identical source', () => {
    const bytes = makeMidi((midi) => {
      const t = midi.addTrack();
      t.channel = 0;
      t.addNote({ midi: 60, ticks: 0, durationTicks: 120 });
      t.addNote({ midi: 62, ticks: 120, durationTicks: 120 });
    });
    const a = convertMidiToBax(bytes, defaultConvertOptions('gameboy'));
    const b = convertMidiToBax(bytes, defaultConvertOptions('gameboy'));
    expect(a.source).toBe(b.source);
  });

  test('GM drums map to named tokens on noise', () => {
    const bytes = makeMidi((midi) => {
      const t = midi.addTrack();
      t.channel = 9; // GM drums
      t.addNote({ midi: 36, ticks: 0, durationTicks: 120 });
      t.addNote({ midi: 38, ticks: 240, durationTicks: 120 });
      t.addNote({ midi: 42, ticks: 360, durationTicks: 60 });
    });
    const result = convertMidiToBax(bytes, defaultConvertOptions('gameboy'));
    expect(result.source).toMatch(/\bkick\b/);
    expect(result.source).toMatch(/\bsnare\b/);
    expect(result.source).toMatch(/\bhihat\b/);
    expect(result.source).toContain('channel 4');
  });

  test('GB kit defines ghost and crash for mapped GM keys 37 and 49', () => {
    const bytes = makeMidi((midi) => {
      const t = midi.addTrack();
      t.channel = 9;
      t.addNote({ midi: 37, ticks: 0, durationTicks: 120 }); // side stick → ghost
      t.addNote({ midi: 49, ticks: 240, durationTicks: 240 }); // crash
    });
    const result = convertMidiToBax(bytes, defaultConvertOptions('gameboy'), 'gb-ghost-crash');
    expect(result.source).toMatch(/inst ghost\s+type=noise/);
    expect(result.source).toMatch(/inst crash\s+type=noise/);
    expect(result.source).toMatch(/\bghost\b/);
    expect(result.source).toMatch(/\bcrash\b/);
    expectParses(result.source);
  });
});

describe('packing', () => {
  test('over-polyphony drops lower-priority streams with warning', () => {
    const opts = defaultConvertOptions('gameboy');
    const mk = (track: number, pitch: number, start: number): QuantizedNote => ({
      startTick: start,
      durationTicks: 4,
      pitch,
      velocity: 100,
      midiChannel: track,
      sourceTrackIndex: track,
      sourceEventIndex: 0,
      trackName: `t${track}`,
      program: 81,
      isDrum: false,
      shiftTicks: 0,
    });
    // 5 overlapping melodic streams on GB (3 melodic channels)
    const notes: QuantizedNote[] = [];
    for (let t = 0; t < 5; t++) {
      notes.push(mk(t, 60 + t, 0));
    }
    const diags: any[] = [];
    const streams = classifyStreams(notes, opts, diags);
    // Force all as pulse1-like high priority by leaving as-is
    const { notesDropped } = packChannels(streams, opts, diags);
    expect(notesDropped).toBeGreaterThan(0);
    expect(diags.some((d) => d.code === 'over_polyphony')).toBe(true);
  });

  test('non-overlapping streams multiplex with inst()', () => {
    const opts = defaultConvertOptions('gameboy');
    const notes: QuantizedNote[] = [
      {
        startTick: 0,
        durationTicks: 8,
        pitch: 72,
        velocity: 100,
        midiChannel: 0,
        sourceTrackIndex: 0,
        sourceEventIndex: 0,
        trackName: 'lead',
        program: 81,
        isDrum: false,
        shiftTicks: 0,
      },
      {
        startTick: 16,
        durationTicks: 8,
        pitch: 67,
        velocity: 90,
        midiChannel: 1,
        sourceTrackIndex: 1,
        sourceEventIndex: 0,
        trackName: 'harmony',
        program: 84,
        isDrum: false,
        shiftTicks: 0,
      },
    ];
    const diags: any[] = [];
    // Use config to force both onto pulse1 for multiplexing test
    const withMap = {
      ...opts,
      trackMappings: [
        { midiTrack: 0, target: 'pulse1' as const, instrument: 'lead' },
        { midiTrack: 1, target: 'pulse1' as const, instrument: 'arp' },
      ],
    };
    const streams = classifyStreams(notes, withMap, diags);
    const { channels, notesDropped } = packChannels(streams, withMap, diags);
    expect(notesDropped).toBe(0);
    const pulse1 = channels.find((c) => c.role === 'pulse1');
    expect(pulse1).toBeTruthy();
    expect(pulse1!.hits.length).toBe(2);
    expect(pulse1!.hits.some((h) => h.instrument === 'arp' || h.instrument === 'lead')).toBe(true);
  });

  test('inst() multiplexing on pulse2 emits secondary instrument as pulse2', () => {
    const bytes = makeMidi((midi) => {
      const a = midi.addTrack();
      a.name = 'A';
      a.channel = 0;
      a.addNote({ midi: 72, ticks: 0, durationTicks: 480 });
      const b = midi.addTrack();
      b.name = 'B';
      b.channel = 1;
      b.addNote({ midi: 67, ticks: 960, durationTicks: 480 });
    });
    const opts = resolveConvertOptions({
      chip: 'gameboy',
      config: parseImportConfig({
        trackMappings: [
          { midiTrack: 0, target: 'pulse2', instrument: 'pluck' },
          { midiTrack: 1, target: 'pulse2', instrument: 'bell' },
        ],
      }),
    });
    const result = convertMidiToBax(bytes, opts, 'mux-p2');
    expect(result.source).toMatch(/inst pluck\s+type=pulse2/);
    expect(result.source).toMatch(/inst bell\s+type=pulse2/);
    expect(result.source).toMatch(/inst\((pluck|bell)\)/);
    expect(result.summary.channelsPacked).toBe(1);
    expectParses(result.source);
  });

  test('inst() multiplexing on wave emits secondary instrument as wave', () => {
    const bytes = makeMidi((midi) => {
      const a = midi.addTrack();
      a.name = 'BassA';
      a.channel = 0;
      a.addNote({ midi: 36, ticks: 0, durationTicks: 480 });
      const b = midi.addTrack();
      b.name = 'BassB';
      b.channel = 1;
      b.addNote({ midi: 38, ticks: 960, durationTicks: 480 });
    });
    const opts = resolveConvertOptions({
      chip: 'gameboy',
      config: parseImportConfig({
        trackMappings: [
          { midiTrack: 0, target: 'wave', instrument: 'bass_a' },
          { midiTrack: 1, target: 'wave', instrument: 'bass_b' },
        ],
      }),
    });
    const result = convertMidiToBax(bytes, opts, 'mux-wave');
    expect(result.source).toMatch(/inst bass_a\s+type=wave/);
    expect(result.source).toMatch(/inst bass_b\s+type=wave/);
    expect(result.source).toMatch(/inst\((bass_a|bass_b)\)/);
    expectParses(result.source);
  });

  test('sectionBars emit Pattern Grid multi-seq channel lines', () => {
    const bytes = makeMidi((midi) => {
      const t = midi.addTrack();
      t.name = 'Lead';
      t.channel = 0;
      t.instrument.number = 81;
      // 16 bars at 120 BPM, PPQ 480 → 1 bar = 1920 ticks if 4/4
      for (let bar = 0; bar < 16; bar++) {
        t.addNote({ midi: 60, ticks: bar * 1920, durationTicks: 480 });
      }
    });
    const result = convertMidiToBax(bytes, defaultConvertOptions('gameboy'), 'sections');
    expect(result.source).toMatch(/# --- Section 1: Bars 1-8 ---/);
    expect(result.source).toMatch(/# --- Section 2: Bars 9-16 ---/);
    expect(result.source).toMatch(/seq lead_s01 =/);
    expect(result.source).toMatch(/seq lead_s02 =/);
    expect(result.source).toMatch(/channel 1 => inst \S+ seq lead_s01 lead_s02/);
    expectParses(result.source);

    const mono = convertMidiToBax(
      bytes,
      { ...defaultConvertOptions('gameboy'), sectionBars: 0 },
      'mono',
    );
    expect(mono.source).not.toMatch(/Section 1:/);
    expect(mono.source).toMatch(/seq lead_seq =/);
    expect(mono.source).toMatch(/channel 1 => inst \S+ seq lead_seq\b/);
  });

  test('stacked kick+snare keeps snare (backbeat) and drops kick', () => {
    const opts = defaultConvertOptions('gameboy');
    const mkDrum = (pitch: number, start: number, idx: number): QuantizedNote => ({
      startTick: start,
      durationTicks: 1,
      pitch,
      velocity: 100,
      midiChannel: 9,
      sourceTrackIndex: 0,
      sourceEventIndex: idx,
      trackName: 'drums',
      program: 0,
      isDrum: true,
      shiftTicks: 0,
    });
    // Four-on-floor + snare on 2/4 (same tick as kick)
    const notes: QuantizedNote[] = [
      mkDrum(36, 0, 0),
      mkDrum(36, 4, 1),
      mkDrum(38, 4, 2),
      mkDrum(36, 8, 3),
      mkDrum(36, 12, 4),
      mkDrum(38, 12, 5),
    ];
    const diags: any[] = [];
    const streams = classifyStreams(notes, opts, diags);
    const { channels, notesDropped } = packChannels(streams, opts, diags);
    const noise = channels.find((c) => c.role === 'noise');
    expect(noise).toBeTruthy();
    const tokens = noise!.hits.map((h) => `${h.startTick}:${h.token}`);
    expect(tokens).toEqual(['0:kick', '4:snare', '8:kick', '12:snare']);
    expect(notesDropped).toBe(2);
    expect(diags.some((d) => d.code === 'drum_flam')).toBe(false);
  });

  test('drumFlamTicks>=1 can flam losing hat onto next empty tick', () => {
    const opts = { ...defaultConvertOptions('gameboy'), drumFlamTicks: 1 };
    const mkDrum = (pitch: number, start: number, idx: number): QuantizedNote => ({
      startTick: start,
      durationTicks: 1,
      pitch,
      velocity: 100,
      midiChannel: 9,
      sourceTrackIndex: 0,
      sourceEventIndex: idx,
      trackName: 'drums',
      program: 0,
      isDrum: true,
      shiftTicks: 0,
    });
    const notes = [mkDrum(36, 0, 0), mkDrum(42, 0, 1)];
    const diags: any[] = [];
    const streams = classifyStreams(notes, opts, diags);
    const { channels } = packChannels(streams, opts, diags);
    const noise = channels.find((c) => c.role === 'noise');
    expect(noise!.hits.map((h) => `${h.startTick}:${h.token}`)).toEqual(['0:kick', '1:hihat']);
    expect(diags.some((d) => d.code === 'drum_flam')).toBe(true);
  });

  test('trackMapping target dmc reaches channel 5, not noise', () => {
    const opts = resolveConvertOptions({
      chip: 'nes',
      config: parseImportConfig({
        dmcReinforcement: { enabled: true },
        trackMappings: [{ midiTrack: 0, target: 'dmc' }],
      }),
    });
    const notes: QuantizedNote[] = [
      {
        startTick: 0,
        durationTicks: 2,
        pitch: 36,
        velocity: 100,
        midiChannel: 0,
        sourceTrackIndex: 0,
        sourceEventIndex: 0,
        trackName: 'DMC',
        program: 0,
        isDrum: false,
        shiftTicks: 0,
      },
      {
        startTick: 4,
        durationTicks: 2,
        pitch: 38,
        velocity: 100,
        midiChannel: 0,
        sourceTrackIndex: 0,
        sourceEventIndex: 1,
        trackName: 'DMC',
        program: 0,
        isDrum: false,
        shiftTicks: 0,
      },
    ];
    const diags: any[] = [];
    const streams = classifyStreams(notes, opts, diags);
    expect(streams.every((s) => s.roleHint === 'dmc' && s.isDrum)).toBe(true);
    const { channels } = packChannels(streams, opts, diags);
    const dmc = channels.find((c) => c.role === 'dmc');
    const noise = channels.find((c) => c.role === 'noise');
    expect(dmc).toBeTruthy();
    expect(noise).toBeUndefined();
    expect(dmc!.channelIndex).toBe(5);
    expect(dmc!.hits.map((h) => h.token)).toEqual(['kick_dmc', 'snare_dmc']);
  });
});

describe('ignored MIDI timing diagnostics', () => {
  function baseParsed(overrides: Partial<MidiParseResult> = {}): MidiParseResult {
    return {
      ppq: 480,
      name: 'timing',
      formatHint: '1',
      notes: [
        {
          startMidiTicks: 0,
          durationMidiTicks: 480,
          pitch: 60,
          velocity: 100,
          midiChannel: 0,
          sourceTrackIndex: 0,
          sourceEventIndex: 0,
          trackName: 'Lead',
          program: 81,
          isDrum: false,
        },
      ],
      tempos: [{ midiTicks: 0, bpm: 120 }],
      timeSignatures: [{ midiTicks: 0, numerator: 4, denominator: 4 }],
      trackCount: 1,
      ...overrides,
    };
  }

  test('does not warn for single initial tempo and 4/4', () => {
    const result = convertMidiParseResult(baseParsed(), defaultConvertOptions('gameboy'));
    expect(result.diagnostics.some((d) => d.code === 'tempo_map_ignored')).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'time_signature_ignored')).toBe(false);
  });

  test('warns when subsequent tempo changes are ignored', () => {
    const result = convertMidiParseResult(
      baseParsed({
        tempos: [
          { midiTicks: 0, bpm: 100 },
          { midiTicks: 1920, bpm: 140 },
        ],
      }),
      defaultConvertOptions('gameboy'),
    );
    expect(result.summary.bpm).toBe(100);
    const warn = result.diagnostics.find((d) => d.code === 'tempo_map_ignored');
    expect(warn?.level).toBe('warn');
    expect(warn?.message).toMatch(/140/);
    expect(warn?.message).toMatch(/constant tempo/);
  });

  test('warns when non-4/4 time signature is ignored', () => {
    const result = convertMidiParseResult(
      baseParsed({
        timeSignatures: [{ midiTicks: 0, numerator: 3, denominator: 4 }],
      }),
      defaultConvertOptions('gameboy'),
    );
    const warn = result.diagnostics.find((d) => d.code === 'time_signature_ignored');
    expect(warn?.level).toBe('warn');
    expect(warn?.message).toMatch(/3\/4/);
    expect(warn?.message).toMatch(/16-tick/);
  });

  test('warns when mid-song time signature changes are ignored', () => {
    const result = convertMidiParseResult(
      baseParsed({
        timeSignatures: [
          { midiTicks: 0, numerator: 4, denominator: 4 },
          { midiTicks: 3840, numerator: 4, denominator: 4 },
        ],
      }),
      defaultConvertOptions('gameboy'),
    );
    expect(result.diagnostics.some((d) => d.code === 'time_signature_ignored')).toBe(true);
  });
});
