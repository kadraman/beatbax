import {
  applyNudge,
  longestTempo,
  selectSourceTempo,
  writtenBpm,
} from '../../../src/import/midi';
import { BAR, channelBars, codes, convertWith, parseResult, rawNote, S } from './arrangement-helpers';

/** A lead note on every beat of bars `fromBar..toBar`, offset by `offset` sixteenths. */
function beats(fromBar: number, toBar: number, offset = 0) {
  const out = [];
  for (let bar = fromBar; bar <= toBar; bar++) {
    for (let beat = 0; beat < 4; beat++) {
      out.push(rawNote(0, 60 + beat, (bar - 1) * 16 + beat * 4 + offset, 2));
    }
  }
  return out;
}

const countInTempos = [
  { midiTicks: 0, bpm: 200 },
  { midiTicks: BAR, bpm: 96 },
];

describe('089 US3: tempo selection', () => {
  test('first keeps the 006 rule; longest picks the tempo held longest', () => {
    const parsed = parseResult(beats(1, 5), { tempos: countInTempos });
    expect(selectSourceTempo(parsed, { tempo: 'first' }).bpm).toBe(200);
    expect(selectSourceTempo(parsed, { tempo: 'longest' }).bpm).toBe(96);
    expect(longestTempo(parsed)?.bpm).toBe(96);
  });

  test('longest breaks ties toward the lower BPM', () => {
    // Each tempo holds exactly one bar up to the last note end.
    const parsed = parseResult([rawNote(0, 60, 0, 4), rawNote(0, 62, 28, 4)], {
      tempos: [
        { midiTicks: 0, bpm: 140 },
        { midiTicks: BAR, bpm: 100 },
      ],
    });
    expect(selectSourceTempo(parsed, { tempo: 'longest' }).bpm).toBe(100);
  });

  test('bpm override wins over the tempo policy', () => {
    const parsed = parseResult(beats(1, 2), { tempos: countInTempos });
    const sel = selectSourceTempo(parsed, { bpm: 110, tempo: 'longest' });
    expect(sel).toMatchObject({ bpm: 110, policy: 'override' });
    expect(sel.ignored.map((t) => t.bpm)).toEqual([200, 96]);
    expect(selectSourceTempo(parsed, { bpm: 96, tempo: 'first' }).ignored.map((t) => t.bpm)).toEqual([200]);
  });

  test('written bpm scales by ticksPerBeat / 4', () => {
    expect(writtenBpm(135, 3)).toBeCloseTo(101.25);
    expect(Math.round(writtenBpm(135, 3))).toBe(101);
    expect(writtenBpm(120, 4)).toBe(120);
    expect(writtenBpm(96, 8)).toBe(192);
  });

  test('conversion writes the override bpm, scaled for ticksPerBeat ≠ 4', () => {
    const parsed = parseResult(beats(1, 1));
    expect(convertWith(parsed, { bpm: 96 }).source).toMatch(/^bpm 96$/m);
    expect(convertWith(parsed, { bpm: 96, ticksPerBeat: 3, patternTicks: 12 }).source).toMatch(/^bpm 72$/m);
  });

  test('FR-040: ticksPerBeat 3 alone writes the scaled source tempo', () => {
    const parsed = parseResult(beats(1, 1), { tempos: [{ midiTicks: 0, bpm: 135 }] });
    const result = convertWith(parsed, { ticksPerBeat: 3, patternTicks: 12 });
    expect(result.source).toMatch(/^bpm 101$/m);
    expect(result.summary.bpm).toBe(101);
  });

  test('tempo_map_ignored reports tempos other than the longest-held one', () => {
    const result = convertWith(parseResult(beats(1, 5), { tempos: countInTempos }), { tempo: 'longest' });
    const d = result.diagnostics.find((x) => x.code === 'tempo_map_ignored');
    expect(d?.message).toMatch(/longest-held bpm 96 \(t=0 bpm=200\)/);
    expect(result.source).toMatch(/^bpm 96$/m);
  });
});

describe('089 US3: window and nudge', () => {
  test('startBar/endBar: output bar 1 holds startBar and the song ends after endBar', () => {
    const parsed = parseResult(beats(1, 6));
    const result = convertWith(parsed, { startBar: 3, endBar: 4 });
    const bars = channelBars(result.source, 1);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toBe('C4:2 .:2 C#4:2 .:2 D4:2 .:2 D#4:2 .:2');
    expect(result.summary.barsGenerated).toBe(2);
    expect(result.summary.notesQuantized).toBe(8);
    // Window drops are by choice, not counted as dropped.
    expect(result.summary.notesDropped).toBe(0);
  });

  test('a note running past endBar is shortened to the window end', () => {
    const parsed = parseResult([rawNote(0, 60, 12, 12)]);
    const result = convertWith(parsed, { endBar: 1 });
    expect(channelBars(result.source, 1)).toEqual(['.:12 C4:4']);
  });

  test('mapping bar ranges stay in source bars when a window is set', () => {
    const parsed = parseResult(beats(1, 4));
    const result = convertWith(parsed, {
      startBar: 2,
      unmappedTracks: 'drop',
      trackMappings: [{ midiTrack: 0, target: 'pulse2', instrument: 'late', fromBar: 3 }],
    });
    const bars = channelBars(result.source, 2);
    // Output bar 1 = source bar 2 (not in range), output bar 2 = source bar 3.
    expect(bars[0]).toBe('.:16');
    expect(bars[1]).toBe('C4:2 .:2 C#4:2 .:2 D4:2 .:2 D#4:2 .:2');
  });

  test('nudge -1 moves a late grid back onto the beat before quantizing', () => {
    const parsed = parseResult(beats(1, 1, 1));
    const late = convertWith(parsed, {});
    expect(channelBars(late.source, 1)[0]).toBe('. C4:2 .:2 C#4:2 .:2 D4:2 .:2 D#4:2 .');
    const nudged = convertWith(parsed, { nudge: -1 });
    expect(channelBars(nudged.source, 1)[0]).toBe('C4:2 .:2 C#4:2 .:2 D4:2 .:2 D#4:2 .:2');
  });

  test('applyNudge clamps notes pushed before tick 0 to start at 0', () => {
    const [n] = applyNudge([rawNote(0, 60, 0, 4)], -S);
    expect(n!.startMidiTicks).toBe(0);
    expect(n!.durationMidiTicks).toBe(3 * S);
  });

  test('count-in song: tempo longest + startBar 2 + nudge', () => {
    const notes = [rawNote(1, 84, 0, 1), rawNote(1, 84, 4, 1), ...beats(2, 3, 1)];
    const result = convertWith(parseResult(notes, { tempos: countInTempos }), {
      tempo: 'longest',
      startBar: 2,
      nudge: -1,
    });
    expect(result.source).toMatch(/^bpm 96$/m);
    expect(channelBars(result.source, 1)).toEqual([
      'C4:2 .:2 C#4:2 .:2 D4:2 .:2 D#4:2 .:2',
      'C4:2 .:2 C#4:2 .:2 D4:2 .:2 D#4:2 .:2',
    ]);
    expect(codes(result)).toContain('tempo_map_ignored');
  });

  test('deterministic output with timing options', () => {
    const parsed = parseResult(beats(1, 4, 1), { tempos: countInTempos });
    const cfg = { tempo: 'longest', startBar: 2, endBar: 3, nudge: -1 };
    expect(convertWith(parsed, cfg).source).toBe(convertWith(parsed, cfg).source);
  });
});
