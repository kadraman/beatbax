import { Midi } from '@tonejs/midi';
import { convertMidiToBax, defaultConvertOptions } from '../../../src/import/midi';
import { classifyStreams } from '../../../src/import/midi/roles';
import { packChannels } from '../../../src/import/midi/pack';
import { readMidiBytes } from '../../../src/import/midi/reader';
import type { QuantizedNote } from '../../../src/import/midi/types';

function makeMidi(builder: (midi: Midi) => void): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(120);
  builder(midi);
  return midi.toArray();
}

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
});
