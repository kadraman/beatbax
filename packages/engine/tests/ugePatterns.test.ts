import {
  STRUCTURE_STEPS,
  UGE_PATTERN_BREAK_CODE,
  UGE_PATTERN_BREAK_PARAM,
  UGE_PATTERN_ROWS,
  applyPatternBreaks,
  blankUgePattern,
  chunkCells,
  dedupeChannelPatterns,
  emptyUgeCell,
  framesFromSourceRuns,
  groupSourcePatternRuns,
  hashUgePattern,
  padPatternTo64,
  structureStepLength,
  type SourceRun,
  type UgePatternCell,
} from '../src/export/ugePatterns';
import type { ChannelEvent } from '../src/song/songModel';

function note(sourcePattern: string): ChannelEvent {
  return { type: 'note', token: 'C5', sourcePattern } as ChannelEvent;
}

function rest(sourcePattern?: string): ChannelEvent {
  return { type: 'rest', ...(sourcePattern ? { sourcePattern } : {}) } as ChannelEvent;
}

function cell(noteValue: number, extra: Partial<UgePatternCell> = {}): UgePatternCell {
  return { note: noteValue, instrument: 1, effectCode: 0, effectParam: 0, ...extra };
}

describe('ugePatterns grouping', () => {
  test('splits consecutive repeats when patternIndex changes', () => {
    const events = [
      { type: 'note', token: 'C5', sourcePattern: 'p', patternIndex: 0 },
      { type: 'note', token: 'C5', sourcePattern: 'p', patternIndex: 0 },
      { type: 'note', token: 'C5', sourcePattern: 'p', patternIndex: 1 },
      { type: 'note', token: 'C5', sourcePattern: 'p', patternIndex: 1 },
    ] as ChannelEvent[];
    expect(groupSourcePatternRuns(events)).toEqual([
      { name: 'p', start: 0, length: 2, patternIndex: 0 },
      { name: 'p', start: 2, length: 2, patternIndex: 1 },
    ]);
  });

  test('groups consecutive sourcePattern runs', () => {
    const events = [
      note('a'), note('a'),
      note('b'), note('b'), note('b'),
      note('a'),
    ];
    expect(groupSourcePatternRuns(events)).toEqual<SourceRun[]>([
      { name: 'a', start: 0, length: 2, patternIndex: undefined },
      { name: 'b', start: 2, length: 3, patternIndex: undefined },
      { name: 'a', start: 5, length: 1, patternIndex: undefined },
    ]);
  });

  test('structureStepLength requires a shared 16/32/64', () => {
    expect(structureStepLength([
      [{ name: 'a', start: 0, length: 16, patternIndex: 0 }, { name: 'b', start: 16, length: 16, patternIndex: 1 }],
      [{ name: 'c', start: 0, length: 16, patternIndex: 0 }],
    ])).toBe(16);
    expect(structureStepLength([
      [{ name: 'a', start: 0, length: 16, patternIndex: 0 }],
      [{ name: 'c', start: 0, length: 32, patternIndex: 0 }],
    ])).toBeNull();
    expect(structureStepLength([
      [{ name: 'a', start: 0, length: 8, patternIndex: 0 }],
    ])).toBeNull();
    expect(STRUCTURE_STEPS).toEqual([16, 32, 64]);
  });

  test('framesFromSourceRuns pads each run to 64', () => {
    const cells = Array.from({ length: 32 }, (_, i) => cell(i));
    const frames = framesFromSourceRuns(cells, [
      { name: 'a', start: 0, length: 16 },
      { name: 'b', start: 16, length: 16 },
    ]);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toHaveLength(UGE_PATTERN_ROWS);
    expect(frames[0][0].note).toBe(0);
    expect(frames[0][15].note).toBe(15);
    expect(frames[0][16].note).toBe(90);
    expect(frames[1][0].note).toBe(16);
  });
});

describe('ugePatterns hashing', () => {
  test('dedupes identical 64-row frames in the order list', () => {
    const a = padPatternTo64([cell(1), cell(2)]);
    const b = padPatternTo64([cell(3)]);
    const { unique, order } = dedupeChannelPatterns([a, b, a, a]);
    expect(unique).toHaveLength(2);
    expect(order).toEqual([0, 1, 0, 0]);
    expect(hashUgePattern(unique[0])).toBe(hashUgePattern(a));
  });

  test('chunkCells splits a linear timeline', () => {
    const cells = Array.from({ length: 70 }, (_, i) => cell(i));
    const chunks = chunkCells(cells, 64);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(64);
    expect(chunks[1]).toHaveLength(6);
  });

  test('applyPatternBreaks writes D01 on the first free channel', () => {
    const frames = [
      [blankUgePattern()],
      [blankUgePattern()],
    ];
    frames[0][0][15].effectCode = 0xE;
    applyPatternBreaks(frames, 15);
    expect(frames[0][0][15].effectCode).toBe(0xE);
    expect(frames[1][0][15].effectCode).toBe(UGE_PATTERN_BREAK_CODE);
    expect(frames[1][0][15].effectParam).toBe(UGE_PATTERN_BREAK_PARAM);
  });

  test('emptyUgeCell is a rest', () => {
    expect(emptyUgeCell().note).toBe(90);
    expect(rest('a')).toMatchObject({ type: 'rest', sourcePattern: 'a' });
  });
});
