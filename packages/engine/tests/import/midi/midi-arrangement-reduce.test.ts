import { adjustPitch, clipToRange, reduceMono, resolveMonophonic } from '../../../src/import/midi';
import type { QuantizedNote } from '../../../src/import/midi/types';
import { channelBars, codes, convertWith, parseResult, rawNote } from './arrangement-helpers';

let ev = 0;
function q(start: number, dur: number, pitch: number, velocity = 100): QuantizedNote {
  return {
    startTick: start,
    durationTicks: dur,
    pitch,
    velocity,
    midiChannel: 0,
    sourceTrackIndex: 0,
    sourceEventIndex: ev++,
    trackName: 't',
    program: 0,
    isDrum: false,
    shiftTicks: 0,
  };
}

const summary = (notes: QuantizedNote[]) => notes.map((n) => [n.startTick, n.durationTicks, n.pitch]);

describe('089 US2: reduceMono policies', () => {
  const chord = () => [q(0, 4, 60), q(0, 4, 64), q(0, 4, 67)];

  test('highest keeps the top of a chord', () => {
    const { kept, dropped } = reduceMono(chord(), 'highest', 1);
    expect(summary(kept)).toEqual([[0, 4, 67]]);
    expect(dropped).toBe(2);
  });

  test('lowest keeps the bottom of a chord', () => {
    const { kept, dropped } = reduceMono(chord(), 'lowest', 1);
    expect(summary(kept)).toEqual([[0, 4, 60]]);
    expect(dropped).toBe(2);
  });

  test('newest: a note starting while another is held shortens the held note', () => {
    const { kept, dropped } = reduceMono([q(0, 8, 60), q(2, 8, 62), q(4, 8, 64)], 'newest', 1);
    expect(summary(kept)).toEqual([
      [0, 2, 60],
      [2, 2, 62],
      [4, 8, 64],
    ]);
    expect(dropped).toBe(0);
  });

  test('highest: a higher note during a held note wins and shortens it', () => {
    const { kept } = reduceMono([q(0, 16, 60), q(4, 4, 72)], 'highest', 1);
    expect(summary(kept)).toEqual([
      [0, 4, 60],
      [4, 4, 72],
    ]);
  });

  test('highest: a lower note during a long tail is dropped', () => {
    const { kept, dropped } = reduceMono([q(0, 16, 72), q(4, 2, 69)], 'highest', 1);
    expect(summary(kept)).toEqual([[0, 16, 72]]);
    expect(dropped).toBe(1);
  });

  test('legato tail rule: tail <= 1/4 of the held duration lets a lower note win', () => {
    // Held 16 steps, lower note at step 12: tail 4 = 16/4.
    const { kept } = reduceMono([q(0, 16, 72), q(12, 4, 65)], 'highest', 1);
    expect(summary(kept)).toEqual([
      [0, 12, 72],
      [12, 4, 65],
    ]);
    // Tail 5 > 16/4 and > one grid step: dropped.
    expect(reduceMono([q(0, 16, 72), q(11, 4, 65)], 'highest', 1).dropped).toBe(1);
  });

  test('legato tail rule: tail <= one grid step lets a lower note win', () => {
    // Held 4 steps (1/4 = 1); tail 2 <= grid 2.
    const { kept } = reduceMono([q(0, 4, 72), q(2, 4, 65)], 'highest', 2);
    expect(summary(kept)).toEqual([
      [0, 2, 72],
      [2, 4, 65],
    ]);
    // Tail 3 > grid 2 and > 4/4: dropped.
    expect(reduceMono([q(0, 4, 72), q(1, 4, 65)], 'highest', 2).dropped).toBe(1);
  });

  test('lowest mirrors highest for held notes', () => {
    expect(summary(reduceMono([q(0, 16, 48), q(4, 4, 43)], 'lowest', 1).kept)).toEqual([
      [0, 4, 48],
      [4, 4, 43],
    ]);
    expect(reduceMono([q(0, 16, 48), q(4, 4, 55)], 'lowest', 1).dropped).toBe(1);
  });

  test('earliest is identical to 006 resolveMonophonic', () => {
    const notes = [q(0, 4, 60, 90), q(0, 4, 64, 110), q(2, 4, 67), q(8, 4, 62), q(10, 2, 59)];
    const ours = reduceMono(notes, 'earliest', 1);
    const theirs = resolveMonophonic(notes, [], 'x');
    expect(new Set(ours.kept)).toEqual(new Set(theirs.kept));
    expect(ours.dropped).toBe(theirs.dropped);
  });

  test('does not mutate input notes', () => {
    const held = q(0, 16, 60);
    reduceMono([held, q(4, 4, 72)], 'highest', 1);
    expect(held.durationTicks).toBe(16);
  });

  test('clipToRange shortens notes past the end tick', () => {
    expect(summary(clipToRange([q(0, 4, 60), q(12, 8, 62)], 16))).toEqual([
      [0, 4, 60],
      [12, 4, 62],
    ]);
  });
});

describe('089 US2: transpose and fold', () => {
  test('transpose then fold into the range by octaves', () => {
    expect(adjustPitch(40, { transpose: 12 })).toBe(52);
    expect(adjustPitch(30, { fold: [36, 59] })).toBe(42);
    expect(adjustPitch(72, { fold: [36, 59] })).toBe(48);
    expect(adjustPitch(50, { transpose: 24, fold: [36, 59] })).toBe(50);
    expect(adjustPitch(120, { transpose: 12 })).toBeNull();
    expect(adjustPitch(5, { transpose: -12 })).toBeNull();
  });

  test('pitch_out_of_range notes are dropped, counted and aggregated per mapping', () => {
    const parsed = parseResult([rawNote(0, 120, 0, 4), rawNote(0, 122, 4, 4), rawNote(0, 60, 8, 4)]);
    const result = convertWith(parsed, {
      trackMappings: [{ midiTrack: 0, target: 'pulse1', instrument: 'lead', transpose: 12 }],
    });
    expect(result.diagnostics.filter((d) => d.code === 'pitch_out_of_range')).toHaveLength(1);
    expect(result.summary.notesDropped).toBe(2);
    expect(result.summary.mappingStats![0]).toMatchObject({ pitchOutOfRange: 2, kept: 1 });
    expect(channelBars(result.source, 1)[0]).toBe('.:8 C5:4 .:4');
  });

  test('fold moves a bass line into the target range', () => {
    const parsed = parseResult([rawNote(0, 28, 0, 4), rawNote(0, 70, 4, 4)]);
    const result = convertWith(parsed, {
      trackMappings: [{ midiTrack: 0, target: 'wave', instrument: 'bass', fold: [36, 59] }],
    });
    expect(channelBars(result.source, 3)[0]).toBe('E2:4 A#3:4 .:8');
  });
});

describe('089 US2: mono policies in conversion', () => {
  test('lanes default to earliest reduction reported as mono_reduce (no chord_flatten)', () => {
    const parsed = parseResult([rawNote(0, 60, 0, 4), rawNote(0, 64, 0, 4), rawNote(0, 67, 0, 4)]);
    const result = convertWith(parsed, { packing: 'lanes', trackMappings: [{ midiTrack: 0, target: 'pulse1' }] });
    expect(codes(result)).toContain('mono_reduce');
    expect(codes(result)).not.toContain('chord_flatten');
    expect(channelBars(result.source, 1)[0]).toBe('C4:4 .:12');
  });

  test('streams mode applies an explicit mono policy before packing', () => {
    const parsed = parseResult([rawNote(0, 60, 0, 4), rawNote(0, 64, 0, 4), rawNote(0, 67, 0, 4)]);
    const result = convertWith(parsed, {
      trackMappings: [{ midiTrack: 0, target: 'pulse1', mono: 'highest' }],
    });
    expect(channelBars(result.source, 1)[0]).toBe('G4:4 .:12');
    expect(codes(result)).not.toContain('chord_flatten');
    expect(result.summary.notesDropped).toBe(2);
  });
});
