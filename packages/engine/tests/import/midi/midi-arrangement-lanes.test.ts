import { gapFill } from '../../../src/import/midi';
import { parse } from '../../../src/parser/index';
import { resolveSong } from '../../../src/song/resolver';
import type { QuantizedNote } from '../../../src/import/midi/types';
import {
  channelBars,
  codes,
  convertWith,
  expectVerifies,
  parseResult,
  patterns,
  rawNote,
} from './arrangement-helpers';

/** Quarter notes on every beat of bars `fromBar..toBar` (1-based). */
function quarters(track: number, pitch: number, fromBar: number, toBar: number) {
  const out = [];
  for (let bar = fromBar; bar <= toBar; bar++) {
    for (let beat = 0; beat < 4; beat++) out.push(rawNote(track, pitch, (bar - 1) * 16 + beat * 4, 4));
  }
  return out;
}

function q(start: number, dur: number): QuantizedNote {
  return {
    startTick: start,
    durationTicks: dur,
    pitch: 60,
    velocity: 100,
    midiChannel: 0,
    sourceTrackIndex: 0,
    sourceEventIndex: start,
    trackName: 't',
    program: 0,
    isDrum: false,
    shiftTicks: 0,
  };
}

describe('089 US1: bar-range mappings and lanes', () => {
  test('two ranged mappings share pulse1 with inst() at the boundary and no over_polyphony', () => {
    // Both tracks play through bars 1–4 (overlapping in time).
    const parsed = parseResult([...quarters(5, 76, 1, 4), ...quarters(0, 72, 1, 4)]);
    const result = convertWith(parsed, {
      packing: 'lanes',
      unmappedTracks: 'drop',
      trackMappings: [
        { midiTrack: 5, target: 'pulse1', instrument: 'riff', fromBar: 1, toBar: 2 },
        { midiTrack: 0, target: 'pulse1', instrument: 'vox', fromBar: 3, toBar: 4 },
      ],
    });
    const bars = channelBars(result.source, 1);
    expect(bars).toHaveLength(4);
    expect(bars[0]).toBe('inst(riff) E5:4 E5:4 E5:4 E5:4');
    expect(bars[2]).toBe('inst(vox) C5:4 C5:4 C5:4 C5:4');
    expect(codes(result)).not.toContain('over_polyphony');
    expect(codes(result)).not.toContain('lane_overlap');
    expect(result.summary.notesDropped).toBe(0);
    expect(result.summary.channelsPacked).toBe(1);
    expectVerifies(result.source);
  });

  test('a later mapping only fills gaps; overlaps are dropped and counted per mapping', () => {
    const lead = [rawNote(0, 72, 0, 2), rawNote(0, 74, 4, 2), rawNote(0, 76, 8, 8)];
    const fill = [rawNote(1, 60, 2, 2), rawNote(1, 62, 6, 2), rawNote(1, 64, 10, 2)];
    const result = convertWith(parseResult([...lead, ...fill]), {
      packing: 'lanes',
      trackMappings: [
        { midiTrack: 0, target: 'pulse1', instrument: 'lead' },
        { midiTrack: 1, target: 'pulse1', instrument: 'fill' },
      ],
    });
    expect(channelBars(result.source, 1)[0]).toBe(
      'inst(lead) C5:2 inst(fill) C4:2 inst(lead) D5:2 inst(fill) D4:2 inst(lead) E5:8',
    );
    const overlap = result.diagnostics.filter((d) => d.code === 'lane_overlap');
    expect(overlap).toHaveLength(1);
    expect(overlap[0]!.message).toMatch(/Dropped 1 note\(s\) from trackMappings\[1\]/);
    expect(result.summary.notesDropped).toBe(1);
    const stats = result.summary.mappingStats!;
    expect(stats[1]).toMatchObject({ matched: 3, kept: 2, laneOverlap: 1, channelIndex: 1 });
    expectVerifies(result.source);
  });

  test('a note running past toBar is shortened to the range boundary', () => {
    const parsed = parseResult([rawNote(0, 72, 12, 8), rawNote(1, 60, 16, 4)]);
    const result = convertWith(parsed, {
      packing: 'lanes',
      trackMappings: [
        { midiTrack: 0, target: 'pulse1', instrument: 'a', toBar: 1 },
        { midiTrack: 1, target: 'pulse1', instrument: 'b', fromBar: 2 },
      ],
    });
    const bars = channelBars(result.source, 1);
    expect(bars[0]).toBe('.:12 inst(a) C5:4');
    expect(bars[1]).toBe('inst(b) C4:4 .:12');
    expect(result.summary.notesDropped).toBe(0);
  });

  test('lane targets are binding: overlapping lanes are gap-filled, never relocated', () => {
    const parsed = parseResult([...quarters(0, 72, 1, 1), ...quarters(1, 67, 1, 1)]);
    const lanes = convertWith(parsed, {
      packing: 'lanes',
      trackMappings: [
        { midiTrack: 0, target: 'pulse2', instrument: 'a' },
        { midiTrack: 1, target: 'pulse2', instrument: 'b' },
      ],
    });
    expect(lanes.source).toMatch(/^channel 2 =>/m);
    expect(lanes.source).not.toMatch(/^channel 1 =>/m);
    expect(lanes.summary.notesDropped).toBe(4);

    // 006 stream packing relocates the second stream instead.
    const streams = convertWith(parsed, {
      trackMappings: [
        { midiTrack: 0, target: 'pulse2', instrument: 'a' },
        { midiTrack: 1, target: 'pulse2', instrument: 'b' },
      ],
    });
    expect(streams.source).toMatch(/^channel 1 =>/m);
    expect(streams.source).toMatch(/^channel 2 =>/m);
  });

  test('unmapped tracks are packed afterwards into what the lanes leave free', () => {
    const parsed = parseResult([...quarters(0, 72, 1, 1), ...quarters(1, 67, 1, 1)]);
    const result = convertWith(parsed, {
      packing: 'lanes',
      trackMappings: [{ midiTrack: 0, target: 'pulse1', instrument: 'a' }],
    });
    expect(result.source).toMatch(/^channel 1 => inst a /m);
    expect(result.source).toMatch(/^channel 2 =>/m);
    expect(result.summary.notesDropped).toBe(0);
  });

  test('one track mapped to two targets in the same range is heard on both channels', () => {
    const parsed = parseResult(quarters(0, 72, 1, 1));
    const result = convertWith(parsed, {
      packing: 'lanes',
      trackMappings: [
        { midiTrack: 0, target: 'pulse1', instrument: 'a' },
        { midiTrack: 0, target: 'pulse2', instrument: 'b' },
      ],
    });
    expect(channelBars(result.source, 1)[0]).toBe('C5:4 C5:4 C5:4 C5:4');
    expect(channelBars(result.source, 2)[0]).toBe('C5:4 C5:4 C5:4 C5:4');
  });

  test('mappings differing only in selector specificity keep the most specific one', () => {
    const parsed = parseResult(quarters(0, 72, 1, 1));
    const result = convertWith(parsed, {
      packing: 'lanes',
      trackMappings: [
        { midiTrack: 0, target: 'pulse1', instrument: 'a' },
        { midiTrack: 0, midiChannel: 1, target: 'pulse1', instrument: 'a' },
      ],
    });
    const stats = result.summary.mappingStats!;
    expect(stats[0]!.matched).toBe(0);
    expect(stats[1]!.matched).toBe(4);
    expect(codes(result)).not.toContain('lane_overlap');
  });

  test('streams mode: ranged mapping selects in-range notes; others fall back to auto mapping', () => {
    const parsed = parseResult(quarters(0, 72, 1, 2));
    const result = convertWith(parsed, {
      trackMappings: [{ midiTrack: 0, target: 'pulse2', instrument: 'solo', fromBar: 2 }],
    });
    expect(channelBars(result.source, 2)[1]).toBe('C5:4 C5:4 C5:4 C5:4');
    expect(channelBars(result.source, 2)[0]).toBe('.:16');
    expect(channelBars(result.source, 1)[0]).toBe('C5:4 C5:4 C5:4 C5:4');
  });

  test('streams mode: a note matching two ranged mappings is heard on both targets', () => {
    const parsed = parseResult(quarters(0, 72, 1, 2));
    const result = convertWith(parsed, {
      trackMappings: [
        { midiTrack: 0, target: 'pulse1', instrument: 'a', fromBar: 1, toBar: 2 },
        { midiTrack: 0, target: 'pulse2', instrument: 'b', fromBar: 2 },
      ],
    });
    expect(channelBars(result.source, 1)).toEqual(['C5:4 C5:4 C5:4 C5:4', 'C5:4 C5:4 C5:4 C5:4']);
    expect(channelBars(result.source, 2)).toEqual(['.:16', 'C5:4 C5:4 C5:4 C5:4']);
    expect(result.summary.mappingStats!.map((s) => s.matched)).toEqual([8, 4]);
    expect(result.summary.notesDropped).toBe(0);
    expectVerifies(result.source);
  });

  test('streams mode: an arrangement mapping receives the note alongside the 006 best match', () => {
    const parsed = parseResult(quarters(0, 72, 1, 1));
    const result = convertWith(parsed, {
      trackMappings: [
        { midiTrack: 0, target: 'pulse1', instrument: 'a' },
        { midiTrack: 0, target: 'pulse2', instrument: 'b', mono: 'highest' },
      ],
    });
    expect(channelBars(result.source, 1)[0]).toBe('C5:4 C5:4 C5:4 C5:4');
    expect(channelBars(result.source, 2)[0]).toBe('C5:4 C5:4 C5:4 C5:4');
  });

  test('streams mode: 006-style mappings still pick a single best match', () => {
    const parsed = parseResult(quarters(0, 72, 1, 1));
    const result = convertWith(parsed, {
      trackMappings: [
        { midiTrack: 0, target: 'pulse1', instrument: 'a' },
        { midiTrack: 0, target: 'pulse2', instrument: 'b' },
      ],
    });
    expect(result.summary.channelsPacked).toBe(1);
    expect(result.source).toMatch(/^channel 1 => inst a /m);
    expect(result.summary.mappingStats!.map((s) => s.matched)).toEqual([4, 0]);
  });

  test('streams mode: ranged mappings differing only in selector specificity keep the most specific one', () => {
    const parsed = parseResult(quarters(0, 72, 1, 1));
    const result = convertWith(parsed, {
      trackMappings: [
        { midiTrack: 0, target: 'pulse1', instrument: 'a', fromBar: 1 },
        { midiTrack: 0, midiChannel: 1, target: 'pulse1', instrument: 'a', fromBar: 1 },
      ],
    });
    expect(result.summary.mappingStats!.map((s) => s.matched)).toEqual([0, 4]);
    expect(result.summary.channelsPacked).toBe(1);
    expect(channelBars(result.source, 1)[0]).toBe('C5:4 C5:4 C5:4 C5:4');
    expect(result.summary.notesDropped).toBe(0);
  });

  test('bar numbers are source bars measured with the first time signature', () => {
    // 2/4 source: a bar is 8 sixteenths, so source bar 3 starts at step 16.
    const notes = [rawNote(0, 72, 0, 2), rawNote(0, 74, 8, 2), rawNote(0, 76, 16, 2)];
    const result = convertWith(
      parseResult(notes, { timeSignatures: [{ midiTicks: 0, numerator: 2, denominator: 4 }] }),
      {
        unmappedTracks: 'drop',
        trackMappings: [{ midiTrack: 0, target: 'pulse1', instrument: 'a', fromBar: 3 }],
      },
    );
    expect(channelBars(result.source, 1)).toEqual(['.:16', 'E5:2 .:14']);
    expect(codes(result)).toContain('time_signature_ignored');
    expect(codes(result)).not.toContain('bar_numbering_first_signature');
  });

  test('warns when bar numbers are used with more than one time signature', () => {
    const result = convertWith(
      parseResult(quarters(0, 72, 1, 2), {
        timeSignatures: [
          { midiTicks: 0, numerator: 4, denominator: 4 },
          { midiTicks: 1920, numerator: 3, denominator: 4 },
        ],
      }),
      { trackMappings: [{ midiTrack: 0, target: 'pulse1', fromBar: 2 }] },
    );
    expect(codes(result)).toContain('bar_numbering_first_signature');
  });

  test('warns when a range starts after the last source bar', () => {
    const result = convertWith(parseResult(quarters(0, 72, 1, 1)), {
      trackMappings: [{ midiTrack: 0, target: 'pulse1', fromBar: 9 }],
    });
    expect(codes(result)).toContain('bar_range_outside_song');
  });

  test('NES: wave target lanes onto the triangle channel', () => {
    const result = convertWith(
      parseResult(quarters(0, 40, 1, 1)),
      { packing: 'lanes', trackMappings: [{ midiTrack: 0, target: 'wave', instrument: 'bass' }] },
      'nes',
    );
    expect(result.source).toMatch(/^channel 3 => inst bass /m);
    expectVerifies(result.source);
  });

  test('deterministic output', () => {
    const parsed = parseResult([...quarters(5, 76, 1, 4), ...quarters(0, 72, 1, 4), ...quarters(2, 64, 1, 4)]);
    const cfg = {
      packing: 'lanes',
      trackMappings: [
        { midiTrack: 5, target: 'pulse1', fromBar: 1, toBar: 2 },
        { midiTrack: 0, target: 'pulse1', fromBar: 3 },
        { midiTrack: 2, target: 'pulse1' },
      ],
    };
    expect(convertWith(parsed, cfg).source).toBe(convertWith(parsed, cfg).source);
  });
});

/** GM drum hits on MIDI channel 10 (track 9): kick on beats, closed hat on off-beats, crowd FX (87) on beat 1. */
function drums(fromBar: number, toBar: number) {
  const drum = { midiChannel: 9, isDrum: true, program: 0 };
  const out = [];
  for (let bar = fromBar; bar <= toBar; bar++) {
    const b = (bar - 1) * 16;
    out.push(rawNote(9, 87, b, 1, drum));
    for (let beat = 0; beat < 4; beat++) {
      out.push(rawNote(9, 36, b + beat * 4, 1, drum));
      out.push(rawNote(9, 42, b + beat * 4 + 2, 1, drum));
    }
  }
  return out;
}

function noiseHits(source: string): number {
  return channelBars(source, 4)
    .join(' ')
    .split(/\s+/)
    .filter((t) => t && !t.startsWith('.') && !t.startsWith('inst')).length;
}

describe('089 US5: drum filters and unmapped tracks', () => {
  test('exclude ignores those note numbers for a noise mapping (not counted as dropped)', () => {
    const result = convertWith(parseResult(drums(1, 1)), {
      trackMappings: [{ midiTrack: 9, target: 'noise', exclude: [87] }],
    });
    expect(noiseHits(result.source)).toBe(8);
    expect(result.summary.notesDropped).toBe(0);
    expect(result.summary.mappingStats?.[0]).toMatchObject({ matched: 8, kept: 8, filtered: 1 });
    expectVerifies(result.source);
  });

  test('include keeps only listed note numbers; exclude still applies on top', () => {
    const inc = convertWith(parseResult(drums(1, 1)), {
      trackMappings: [{ midiTrack: 9, target: 'noise', include: [36] }],
    });
    expect(noiseHits(inc.source)).toBe(4);
    expect(inc.summary.mappingStats?.[0]).toMatchObject({ kept: 4, filtered: 5 });

    const both = convertWith(parseResult(drums(1, 1)), {
      trackMappings: [{ midiTrack: 9, target: 'noise', include: [36, 42], exclude: [42] }],
    });
    expect(noiseHits(both.source)).toBe(4);
  });

  test('filtered drum notes are not auto-mapped elsewhere', () => {
    const result = convertWith(parseResult([...quarters(0, 72, 1, 1), ...drums(1, 1)]), {
      unmappedTracks: 'auto',
      trackMappings: [{ midiTrack: 9, target: 'noise', exclude: [87, 42] }],
    });
    expect(noiseHits(result.source)).toBe(4);
    const heard = [...patterns(result.source).values()]
      .join(' ')
      .split(/\s+/)
      .filter((t) => t && !t.startsWith('.') && !t.startsWith('inst'));
    expect(heard).toHaveLength(8);
    expect(result.summary.notesDropped).toBe(0);
  });

  test("the mapping's drumMap remaps an included note to another drum sound", () => {
    const drum = { midiChannel: 9, isDrum: true, program: 0 };
    const parsed = parseResult([rawNote(9, 87, 0, 1, drum), rawNote(9, 36, 4, 1, drum)]);
    const plain = convertWith(parsed, { trackMappings: [{ midiTrack: 9, target: 'noise', include: [87] }] });
    expect(channelBars(plain.source, 4)).toEqual(['hihat .:15']);
    const remapped = convertWith(parsed, {
      trackMappings: [{ midiTrack: 9, target: 'noise', include: [87], drumMap: { '87': 'snare' } }],
    });
    expect(channelBars(remapped.source, 4)).toEqual(['snare .:15']);
  });

  test('unmappedTracks drop: unmatched tracks produce no output and are listed in one diagnostic', () => {
    const parsed = parseResult([...quarters(0, 72, 1, 2), ...quarters(2, 64, 1, 2), ...drums(1, 2)]);
    const result = convertWith(parsed, {
      unmappedTracks: 'drop',
      trackMappings: [{ midiTrack: 0, target: 'pulse1', instrument: 'lead' }],
    });
    expect(result.summary.channelsPacked).toBe(1);
    expect(result.summary.notesDropped).toBe(0);
    const d = result.diagnostics.filter((x) => x.code === 'unmapped_dropped');
    expect(d).toHaveLength(1);
    expect(d[0]!.level).toBe('info');
    expect(d[0]!.message).toBe(
      'unmappedTracks=drop: excluded 26 note(s) matching no mapping: T2 ch3 (8 note(s)), T9 ch10 (18 note(s))',
    );
    expectVerifies(result.source);
  });

  test('unmappedTracks auto (default): unmatched tracks are packed by 006 rules', () => {
    const parsed = parseResult([...quarters(0, 72, 1, 2), ...quarters(2, 64, 1, 2), ...drums(1, 2)]);
    const result = convertWith(parsed, {
      trackMappings: [{ midiTrack: 0, target: 'pulse1', instrument: 'lead' }],
    });
    expect(result.summary.channelsPacked).toBeGreaterThanOrEqual(3);
    expect(codes(result)).not.toContain('unmapped_dropped');
    expect(noiseHits(result.source)).toBeGreaterThan(0);
  });
});

describe('drum hits are one step long', () => {
  /** A melody over bars 1–2 and GM drums held longer than one step. */
  function heldDrums() {
    const drum = { midiChannel: 9, isDrum: true, program: 0 };
    return parseResult([
      ...quarters(0, 72, 1, 2),
      rawNote(9, 36, 0, 4, drum),
      rawNote(9, 38, 4, 4, drum),
      rawNote(9, 36, 8, 2, drum),
      rawNote(9, 38, 10, 6, drum),
      rawNote(9, 36, 16, 3, drum),
      rawNote(9, 42, 20, 1, drum),
    ]);
  }

  /** Step count of each resolved channel. */
  function channelSteps(source: string): number[] {
    return resolveSong(parse(source)).channels.map((ch: { events: unknown[] }) => ch.events.length);
  }

  test.each([
    ['streams', {}],
    ['lanes', { packing: 'lanes', trackMappings: [{ midiTrack: 9, target: 'noise' }] }],
  ])('%s: a held drum note becomes a hit followed by rests, keeping channels aligned', (_mode, cfg) => {
    const result = convertWith(heldDrums(), cfg);
    expect(channelBars(result.source, 4)).toEqual(['kick .:3 snare .:3 kick . snare .:5', 'kick .:3 hihat .:11']);
    expect(result.source).not.toMatch(/\b(kick|snare|hihat):\d/);
    expect(codes(result)).not.toContain('mono_conflict');
    expect(new Set(channelSteps(result.source))).toEqual(new Set([32]));
    expectVerifies(result.source);
  });

  test('NES: DMC reinforcement hits are one step long', () => {
    const result = convertWith(
      heldDrums(),
      { dmcReinforcement: { enabled: true, kickSample: '@nes/kick', snareSample: '@nes/snare' } },
      'nes',
    );
    const dmc = [...patterns(result.source).entries()].filter(([name]) => name.startsWith('dmc_'));
    expect(dmc.length).toBeGreaterThan(0);
    for (const [, body] of dmc) expect(body).not.toMatch(/_dmc:\d/);
    expect(new Set(channelSteps(result.source))).toEqual(new Set([32]));
    expectVerifies(result.source);
  });

  /** A one-bar melody and a four-step kick starting on its last step. */
  function heldDrumAcrossBar() {
    const drum = { midiChannel: 9, isDrum: true, program: 0 };
    return parseResult([...quarters(0, 72, 1, 1), rawNote(9, 36, 15, 4, drum)]);
  }

  test.each([
    ['streams', {}],
    ['lanes', { packing: 'lanes', trackMappings: [{ midiTrack: 9, target: 'noise' }] }],
  ])('%s: a held drum crossing the last bar line still counts toward the song length', (_mode, cfg) => {
    const result = convertWith(heldDrumAcrossBar(), cfg);
    expect(result.summary.barsGenerated).toBe(2);
    expect(channelBars(result.source, 4)).toEqual(['.:15 kick', '.:16']);
    expect(new Set(channelSteps(result.source))).toEqual(new Set([32]));
    expectVerifies(result.source);
  });

  test('NES: a held DMC-reinforced drum crossing the last bar line keeps the song length', () => {
    const result = convertWith(
      heldDrumAcrossBar(),
      { dmcReinforcement: { enabled: true, kickSample: '@nes/kick', snareSample: '@nes/snare' } },
      'nes',
    );
    expect(result.summary.barsGenerated).toBe(2);
    expect(new Set(channelSteps(result.source))).toEqual(new Set([32]));
    expectVerifies(result.source);
  });
});

describe('gapFill', () => {
  test('keeps notes that fit between placed notes and merges them in order', () => {
    const placed = [q(0, 4), q(8, 4)];
    const { accepted, placed: merged } = gapFill(placed, [q(4, 4), q(6, 4), q(12, 2)]);
    expect(accepted.map((n) => n.startTick)).toEqual([4, 12]);
    expect(merged.map((n) => n.startTick)).toEqual([0, 4, 8, 12]);
  });

  test('touching boundaries do not overlap', () => {
    const { accepted } = gapFill([q(0, 4)], [q(4, 4)]);
    expect(accepted).toHaveLength(1);
  });
});
