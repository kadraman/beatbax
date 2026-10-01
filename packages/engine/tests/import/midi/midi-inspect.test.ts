import { readFileSync } from 'fs';
import { join } from 'path';
import { inspectMidiBytes, inspectMidiParseResult } from '../../../src/import/midi';
import { BAR, parseResult, rawNote } from './arrangement-helpers';

const FIXTURES = join(__dirname, '..', '..', 'fixtures', 'midi');

describe('089 US4: inspect report', () => {
  test('marks a track with an identical note list as a duplicate of the first one', () => {
    const lead = [rawNote(0, 60, 0, 4), rawNote(0, 64, 4, 4)];
    const copy = [rawNote(1, 60, 0, 4), rawNote(1, 64, 4, 4)];
    const other = [rawNote(2, 48, 0, 8)];
    const report = inspectMidiParseResult(parseResult([...lead, ...copy, ...other]));
    expect(report.tracks.map((t) => [t.id, t.duplicateOf])).toEqual([
      ['T0', undefined],
      ['T1', 'T0'],
      ['T2', undefined],
    ]);
  });

  test('per-track fields: channel, program, pitch range, bars and 8-bar activity blocks', () => {
    const notes = [
      rawNote(0, 60, 0, 4),
      rawNote(0, 72, 16 * 2, 4),
      rawNote(0, 67, 16 * 9, 4), // bar 10 → block 2
    ];
    const report = inspectMidiParseResult(parseResult(notes));
    expect(report.bars).toBe(10);
    expect(report.activityBlockBars).toBe(8);
    const [t] = report.tracks;
    expect(t).toMatchObject({
      id: 'T0',
      index: 0,
      channel: 1,
      program: 81,
      name: 'Track 0',
      notes: 3,
      lowPitch: 60,
      highPitch: 72,
      lowNote: 'C4',
      highNote: 'C5',
      firstBar: 1,
      lastBar: 10,
      activity: [2, 1],
    });
  });

  test('lists every tempo with its bar and the longest-held tempo', () => {
    const notes = [rawNote(0, 60, 0, 16 * 5)];
    const report = inspectMidiParseResult(
      parseResult(notes, {
        tempos: [
          { midiTicks: 0, bpm: 200 },
          { midiTicks: BAR, bpm: 96 },
        ],
      }),
    );
    expect(report.tempos).toEqual([
      { bar: 1, midiTicks: 0, bpm: 200 },
      { bar: 2, midiTicks: BAR, bpm: 96 },
    ]);
    expect(report.firstBpm).toBe(200);
    expect(report.longestBpm).toBe(96);
  });

  test('time signatures report their bar, measured with the first signature', () => {
    const notes = [rawNote(0, 60, 0, 12 * 4)];
    const report = inspectMidiParseResult(
      parseResult(notes, {
        timeSignatures: [
          { midiTicks: 0, numerator: 3, denominator: 4 },
          { midiTicks: 12 * 120 * 2, numerator: 4, denominator: 4 },
        ],
      }),
    );
    expect(report.timeSignatures.map((t) => [t.bar, t.numerator, t.denominator])).toEqual([
      [1, 3, 4],
      [3, 4, 4],
    ]);
    expect(report.bars).toBe(4);
  });

  test('a track using several MIDI channels is split into T<n>/ch<c> entries', () => {
    const notes = [rawNote(0, 60, 0, 4, { midiChannel: 0 }), rawNote(0, 36, 0, 4, { midiChannel: 9, isDrum: true })];
    const report = inspectMidiParseResult(parseResult(notes));
    expect(report.tracks.map((t) => [t.id, t.channel])).toEqual([
      ['T0/ch1', 1],
      ['T0/ch10', 10],
    ]);
  });

  test('tracks without notes are omitted', () => {
    const parsed = { ...parseResult([rawNote(2, 60, 0, 4)]), trackCount: 4 };
    const report = inspectMidiParseResult(parsed);
    expect(report.trackCount).toBe(4);
    expect(report.tracks.map((t) => t.id)).toEqual(['T2']);
  });

  test('deterministic for a fixture file, and reads GM program names', () => {
    const bytes = readFileSync(join(FIXTURES, 'f14-dup-unmapped.mid'));
    const a = inspectMidiBytes(bytes);
    const b = inspectMidiBytes(bytes);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.ppq).toBe(480);
    expect(a.tracks.find((t) => t.id === 'T1')?.duplicateOf).toBe('T0');
    expect(a.tracks.every((t) => typeof t.programName === 'string')).toBe(true);
  });
});
