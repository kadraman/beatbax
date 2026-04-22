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
  test('C5 → C-5 (octave preserved)', () => {
    expect(noteToFtm('C5')).toBe('C-5');
  });

  test('A3 → A-3', () => {
    expect(noteToFtm('A3')).toBe('A-3');
  });

  test('G#5 → G#5', () => {
    expect(noteToFtm('G#5')).toBe('G#5');
  });

  test('Bb4 → A#4 (flat to sharp)', () => {
    expect(noteToFtm('Bb4')).toBe('A#4');
  });

  test('Eb5 → D#5', () => {
    expect(noteToFtm('Eb5')).toBe('D#5');
  });

  test('Cb4 → B-3 (C flat = B of lower octave)', () => {
    expect(noteToFtm('Cb4')).toBe('B-3');
  });

  test('C2 → C-2', () => {
    expect(noteToFtm('C2')).toBe('C-2');
  });

  test('C9 → ... (out of FTM range)', () => {
    expect(noteToFtm('C9')).toBe('...');
  });

  test('C0 → C-0', () => {
    expect(noteToFtm('C0')).toBe('C-0');
  });

  test('bad token → ...', () => {
    expect(noteToFtm('?bad')).toBe('...');
  });
});

describe('noiseNoteToFtm', () => {
  test('noise_period=11, normal mode → B-#', () => {
    expect(noiseNoteToFtm({ noise_period: 11, noise_mode: 'normal' })).toBe('B-#');
  });

  test('noise_period=7, normal mode → 7-#', () => {
    expect(noiseNoteToFtm({ noise_period: 7, noise_mode: 'normal' })).toBe('7-#');
  });

  test('noise_period=2, normal mode → 2-#', () => {
    expect(noiseNoteToFtm({ noise_period: 2, noise_mode: 'normal' })).toBe('2-#');
  });

  test('default period=12 when not specified → C-#', () => {
    expect(noiseNoteToFtm({})).toBe('C-#');
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

  test('volSlide:5 → "A30" (scaled)', () => {
    expect(encodeEffect('volSlide', [5], 'pulse1', w)).toBe('A30');
  });

  test('volSlide:-3 → "A02" (scaled)', () => {
    expect(encodeEffect('volSlide', [-3], 'pulse1', w)).toBe('A02');
  });

  test('vib:4,5 → "432" (scaled)', () => {
    expect(encodeEffect('vib', [4, 5], 'pulse1', w)).toBe('432');
  });

  test('bend:+7 → "107" (scaled)', () => {
    expect(encodeEffect('bend', [7], 'pulse1', w)).toBe('107');
  });

  test('bend:-5 → "205" (scaled)', () => {
    expect(encodeEffect('bend', [-5], 'pulse1', w)).toBe('205');
  });

  test('port:16 → "308" (scaled)', () => {
    expect(encodeEffect('port', [16], 'pulse1', w)).toBe('308');
  });

  test('sweep:4,down,7 → "I47"', () => {
    expect(encodeEffect('sweep', [4, 'down', 7], 'pulse1', w)).toBe('I47');
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
    expect(rows[0].note).toBe('C-5');
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

  test('noise channel note uses FTM hex noise-period note', () => {
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
    expect(rows[0].note).toBe('7-#');
  });

  test('persistent effects are auto-cleared on next empty row', () => {
    const events: ChannelEventLike[] = [
      {
        type: 'note',
        token: 'C4',
        instrument: 'lead',
        effects: [{ type: 'bend', params: [7] }],
        sourcePattern: 'a',
      },
      { type: 'rest', sourcePattern: 'a' },
    ];
    const rows = buildPatternRows(events, 2, new Map([['lead', 0]]), 'pulse1', []);
    expect(rows[0].effects[0]?.code).toBe('107');
    expect(rows[1].effects[0]?.code).toBe('100');
  });

  test('persistent effects stay active during sustain and clear after note end', () => {
    const events: ChannelEventLike[] = [
      {
        type: 'note',
        token: 'C4',
        instrument: 'lead',
        effects: [{ type: 'sweep', params: [4, 'up', 7] }],
        sourcePattern: 'a',
      },
      { type: 'sustain', sourcePattern: 'a' },
      { type: 'sustain', sourcePattern: 'a' },
      { type: 'sustain', sourcePattern: 'a' },
      { type: 'rest', sourcePattern: 'a' },
    ];
    const rows = buildPatternRows(events, 5, new Map([['lead', 0]]), 'pulse1', []);
    expect(rows[0].effects[0]?.code).toBe('H47');
    expect(rows[1].effects.length).toBe(0);
    expect(rows[2].effects.length).toBe(0);
    expect(rows[3].effects.length).toBe(0);
    expect(rows[4].effects[0]?.code).toBe('H00');
  });

  test('persistent effects are cleared on final row to prevent loop bleed', () => {
    const events: ChannelEventLike[] = [
      {
        type: 'note',
        token: 'C4',
        instrument: 'lead',
        effects: [{ type: 'volSlide', params: [-4] }],
        sourcePattern: 'a',
      },
      { type: 'sustain', sourcePattern: 'a' },
      { type: 'sustain', sourcePattern: 'a' },
      { type: 'sustain', sourcePattern: 'a' },
    ];
    const rows = buildPatternRows(events, 4, new Map([['lead', 0]]), 'pulse1', []);
    expect(rows[0].effects[0]?.code).toBe('A02');
    expect(rows[3].effects.some((e) => e.code === 'A00')).toBe(true);
  });
});
