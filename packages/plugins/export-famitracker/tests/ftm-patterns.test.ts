/**
 * Unit tests for ftm-patterns.ts
 * Covers note encoding, effect encoding, event grouping, and row building.
 */

import {
  noteToFtm,
  noiseNoteToFtm,
  encodeEffect,
  groupEventsIntoFrames,
  buildPatternRows,
  patternTickLength,
} from '../src/ftm-patterns.js';
import type { ChannelEventLike } from '../src/ftm-types.js';

describe('noteToFtm', () => {
  test('C5 → C-3 (octave - 2)', () => {
    expect(noteToFtm('C5')).toBe('C-3');
  });

  test('A3 → A-1', () => {
    expect(noteToFtm('A3')).toBe('A-1');
  });

  test('G#5 → G#3', () => {
    expect(noteToFtm('G#5')).toBe('G#3');
  });

  test('Bb4 → A#2 (flat to sharp)', () => {
    expect(noteToFtm('Bb4')).toBe('A#2');
  });

  test('Eb5 → D#3', () => {
    expect(noteToFtm('Eb5')).toBe('D#3');
  });

  test('Cb4 → B-1 (C flat = B of lower octave)', () => {
    expect(noteToFtm('Cb4')).toBe('B-1');
  });

  test('C2 → C-0 (minimum octave = 0)', () => {
    expect(noteToFtm('C2')).toBe('C-0');
  });

  test('C9 → C-7 (near maximum)', () => {
    expect(noteToFtm('C9')).toBe('C-7');
  });

  test('C0 → ... (octave -2 = out of FTM range)', () => {
    expect(noteToFtm('C0')).toBe('...');
  });

  test('bad token → ...', () => {
    expect(noteToFtm('?bad')).toBe('...');
  });
});

describe('noiseNoteToFtm', () => {
  test('noise_period=11, normal mode → B-0', () => {
    expect(noiseNoteToFtm({ noise_period: 11, noise_mode: 'normal' })).toBe('B-0');
  });

  test('noise_period=7, normal mode → G-0', () => {
    expect(noiseNoteToFtm({ noise_period: 7, noise_mode: 'normal' })).toBe('G-0');
  });

  test('noise_period=2, normal mode → D-0', () => {
    expect(noiseNoteToFtm({ noise_period: 2, noise_mode: 'normal' })).toBe('D-0');
  });

  test('default period=12 when not specified → C-1', () => {
    expect(noiseNoteToFtm({})).toBe('C-1');
  });
});

describe('encodeEffect', () => {
  const w: string[] = [];

  beforeEach(() => w.splice(0, w.length));

  test('arp:3,7 → "037"', () => {
    expect(encodeEffect('arp', [3, 7], 'pulse1', w)).toBe('037');
  });

  test('arp:4,7,11 (3 offsets) → "047" + warning', () => {
    const code = encodeEffect('arp', [4, 7, 11], 'pulse1', w);
    expect(code).toBe('047');
    expect(w.some((x) => x.includes('2'))).toBe(true);
  });

  test('cut:3 → "S03"', () => {
    expect(encodeEffect('cut', [3], 'pulse1', w)).toBe('S03');
  });

  test('volSlide:5 → "A50"', () => {
    expect(encodeEffect('volSlide', [5], 'pulse1', w)).toBe('A50');
  });

  test('volSlide:-3 → "A03"', () => {
    expect(encodeEffect('volSlide', [-3], 'pulse1', w)).toBe('A03');
  });

  test('vib:4,5 → "454"', () => {
    // vib: params[0]=depth=4, params[1]=rate=5 → 4 + hex(rate=5) + hex(depth=4) → "454"
    expect(encodeEffect('vib', [4, 5], 'pulse1', w)).toBe('454');
  });

  test('bend:+7 → "11C" (slide up)', () => {
    const code = encodeEffect('bend', [7], 'pulse1', w);
    expect(code).toMatch(/^1/);
  });

  test('bend:-5 → slide down code starting with "2"', () => {
    const code = encodeEffect('bend', [-5], 'pulse1', w);
    expect(code).toMatch(/^2/);
  });

  test('port:16 → "310"', () => {
    expect(encodeEffect('port', [16], 'pulse1', w)).toBe('310');
  });

  test('sweep:4,down,7 → "H4F"', () => {
    expect(encodeEffect('sweep', [4, 'down', 7], 'pulse1', w)).toBe('H4F');
  });

  test('sweep:3,up,2 → "H32"', () => {
    expect(encodeEffect('sweep', [3, 'up', 2], 'pulse1', w)).toBe('H32');
  });

  test('sweep on pulse2 → null + warning', () => {
    const code = encodeEffect('sweep', [4, 'down', 7], 'pulse2', w);
    expect(code).toBeNull();
    expect(w.length).toBeGreaterThan(0);
  });

  test('vib on noise → null + warning', () => {
    const code = encodeEffect('vib', [4, 5], 'noise', w);
    expect(code).toBeNull();
    expect(w.length).toBeGreaterThan(0);
  });

  test('trem (dropped globally) → null + warning', () => {
    const code = encodeEffect('trem', [3, 4], 'pulse1', w);
    expect(code).toBeNull();
    expect(w.length).toBeGreaterThan(0);
  });

  test('retrig (dropped globally) → null + warning', () => {
    const code = encodeEffect('retrig', [2], 'pulse1', w);
    expect(code).toBeNull();
    expect(w.length).toBeGreaterThan(0);
  });

  test('echo (dropped globally) → null + warning', () => {
    const code = encodeEffect('echo', [2, 3], 'pulse1', w);
    expect(code).toBeNull();
    expect(w.length).toBeGreaterThan(0);
  });
});

describe('patternTickLength', () => {
  test('plain tokens: ["C4", ".", "E4", "."] → 4', () => {
    expect(patternTickLength(['C4', '.', 'E4', '.'])).toBe(4);
  });

  test('duration tokens: ["C4:4", ".", ".", "."] → 7', () => {
    expect(patternTickLength(['C4:4', '.', '.', '.'])).toBe(7);
  });

  test('empty → 0', () => {
    expect(patternTickLength([])).toBe(0);
  });
});

describe('groupEventsIntoFrames', () => {
  const makeNote = (src: string, bar: number): ChannelEventLike => ({
    type: 'note',
    token: 'C4',
    instrument: 'lead',
    sourcePattern: src,
    barNumber: bar,
  });

  const makeRest = (src: string): ChannelEventLike => ({
    type: 'rest',
    sourcePattern: src,
  });

  const pats: Record<string, string[]> = {
    a: ['C4:4', '.', '.', '.'],    // 7 ticks
    b: ['E4', '.', 'G4', '.'],     // 4 ticks
  };

  test('single pattern "a" gives one frame of 7 events', () => {
    const events: ChannelEventLike[] = [
      makeNote('a', 0),
      { type: 'sustain', sourcePattern: 'a' },
      { type: 'sustain', sourcePattern: 'a' },
      { type: 'sustain', sourcePattern: 'a' },
      makeRest('a'),
      makeRest('a'),
      makeRest('a'),
    ];
    const frames = groupEventsIntoFrames(events, pats);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(7);
  });

  test('seq a,b → two frames (7 + 4 events)', () => {
    const events: ChannelEventLike[] = [
      makeNote('a', 0), { type: 'sustain', sourcePattern: 'a' },
      { type: 'sustain', sourcePattern: 'a' }, { type: 'sustain', sourcePattern: 'a' },
      makeRest('a'), makeRest('a'), makeRest('a'),
      makeNote('b', 1), makeRest('b'), makeNote('b', 2), makeRest('b'),
    ];
    const frames = groupEventsIntoFrames(events, pats);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toHaveLength(7);
    expect(frames[1]).toHaveLength(4);
  });

  test('seq a,a → two frames each of 7 events', () => {
    const events: ChannelEventLike[] = [
      ...Array(7).fill(null).map((_, i) =>
        i === 0 ? makeNote('a', 0) : { type: i < 4 ? 'sustain' : 'rest', sourcePattern: 'a' } as ChannelEventLike,
      ),
      ...Array(7).fill(null).map((_, i) =>
        i === 0 ? makeNote('a', 1) : { type: i < 4 ? 'sustain' : 'rest', sourcePattern: 'a' } as ChannelEventLike,
      ),
    ];
    const frames = groupEventsIntoFrames(events, pats);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toHaveLength(7);
    expect(frames[1]).toHaveLength(7);
  });

  test('no sourcePattern → falls back to chunk size', () => {
    const events: ChannelEventLike[] = Array(32).fill(null).map(() => ({ type: 'rest' }));
    const frames = groupEventsIntoFrames(events, pats, 16);
    expect(frames).toHaveLength(2);
  });
});

describe('buildPatternRows', () => {
  const pats: Record<string, string[]> = {
    a: ['C4:4', '.', '.', '.'],
  };

  test('NoteEvent → note row with instrument index', () => {
    const events: ChannelEventLike[] = [
      {
        type: 'note',
        token: 'C5',
        instrument: 'lead',
        instProps: { type: 'pulse1', duty: '50', env: '12,flat' },
        effects: [],
        sourcePattern: 'a',
      },
    ];
    const instMap = new Map<string, number>([['lead', 0]]);
    const warnings: string[] = [];
    const rows = buildPatternRows(events, 1, instMap, 'pulse1', warnings);
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe('C-3');
    expect(rows[0].instrument).toBe('00');
  });

  test('RestEvent → empty row "..." ".." "." no effects', () => {
    const events: ChannelEventLike[] = [{ type: 'rest', sourcePattern: 'a' }];
    const instMap = new Map<string, number>();
    const warnings: string[] = [];
    const rows = buildPatternRows(events, 1, instMap, 'pulse1', warnings);
    expect(rows[0].note).toBe('...');
    expect(rows[0].instrument).toBe('..');
    expect(rows[0].volume).toBe('.');
  });

  test('SustainEvent → empty row', () => {
    const events: ChannelEventLike[] = [{ type: 'sustain', sourcePattern: 'a' }];
    const rows = buildPatternRows(events, 1, new Map(), 'pulse1', []);
    expect(rows[0].note).toBe('...');
  });

  test('pads rows to rowCount with empty rows', () => {
    const rows = buildPatternRows([], 4, new Map(), 'pulse1', []);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.note).toBe('...');
    }
  });

  test('arp effect on note row → effect code in row', () => {
    const events: ChannelEventLike[] = [
      {
        type: 'note',
        token: 'C4',
        instrument: 'lead',
        effects: [{ type: 'arp', params: [3, 7] }],
        sourcePattern: 'a',
      },
    ];
    const instMap = new Map<string, number>([['lead', 0]]);
    const rows = buildPatternRows(events, 1, instMap, 'pulse1', []);
    expect(rows[0].effects[0]?.code).toBe('037');
  });

  test('noise channel note uses noise period note', () => {
    const events: ChannelEventLike[] = [
      {
        type: 'note',
        token: 'C4',
        instrument: 'snare',
        instProps: { type: 'noise', noise_period: 7, noise_mode: 'normal' },
        effects: [],
        sourcePattern: 'a',
      },
    ];
    const instMap = new Map<string, number>([['snare', 3]]);
    const rows = buildPatternRows(events, 1, instMap, 'noise', []);
    expect(rows[0].note).toBe('G-0');
  });
});
