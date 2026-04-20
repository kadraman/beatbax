/**
 * Integration tests for the FamiTracker text writer.
 * Tests end-to-end conversion of BeatBax NES songs to FTM text format.
 */

import { writeFtmText } from '../src/ftm-text-writer.js';
import type { SongLike } from '../src/ftm-types.js';

function makeNesSong(): SongLike {
  return {
    chip: 'nes',
    bpm: 150,
    metadata: { name: 'Test Song', artist: 'Test Artist' },
    pats: {
      melody: ['C5:4', '.', '.', '.', 'E5:4', '.', '.', '.'],
      bass: ['C3:4', '.', '.', '.', 'G2:4', '.', '.', '.'],
    },
    insts: {
      lead: { type: 'pulse1', duty: '25', env: '12,flat' } as any,
      harmony: { type: 'pulse2', duty: '50', env: '10,flat' } as any,
    },
    seqs: {
      main: ['melody', 'bass'],
    },
    channels: [
      {
        id: 1,
        defaultInstrument: 'lead',
        events: [
          // melody pattern (8 ticks)
          { type: 'note', token: 'C5', instrument: 'lead', instProps: { type: 'pulse1', duty: '25', env: '12,flat' }, effects: [], sourcePattern: 'melody' },
          { type: 'sustain', sourcePattern: 'melody' },
          { type: 'sustain', sourcePattern: 'melody' },
          { type: 'sustain', sourcePattern: 'melody' },
          { type: 'note', token: 'E5', instrument: 'lead', instProps: { type: 'pulse1', duty: '25', env: '12,flat' }, effects: [], sourcePattern: 'melody' },
          { type: 'sustain', sourcePattern: 'melody' },
          { type: 'sustain', sourcePattern: 'melody' },
          { type: 'sustain', sourcePattern: 'melody' },
        ],
      },
      {
        id: 2,
        defaultInstrument: 'harmony',
        events: [
          { type: 'note', token: 'C3', instrument: 'harmony', instProps: { type: 'pulse2', duty: '50', env: '10,flat' }, effects: [], sourcePattern: 'bass' },
          { type: 'sustain', sourcePattern: 'bass' },
          { type: 'sustain', sourcePattern: 'bass' },
          { type: 'sustain', sourcePattern: 'bass' },
          { type: 'note', token: 'G2', instrument: 'harmony', instProps: { type: 'pulse2', duty: '50', env: '10,flat' }, effects: [], sourcePattern: 'bass' },
          { type: 'sustain', sourcePattern: 'bass' },
          { type: 'sustain', sourcePattern: 'bass' },
          { type: 'sustain', sourcePattern: 'bass' },
        ],
      },
    ],
  };
}

describe('writeFtmText', () => {
  let output: string;

  beforeAll(() => {
    output = writeFtmText(makeNesSong());
  });

  test('output starts with FamiTracker text header comment', () => {
    expect(output).toMatch(/^# FamiTracker text export/);
  });

  test('includes TITLE with song name', () => {
    expect(output).toContain('TITLE    "Test Song"');
  });

  test('includes AUTHOR with artist name', () => {
    expect(output).toContain('AUTHOR   "Test Artist"');
  });

  test('includes MACHINE 0 (NTSC)', () => {
    expect(output).toContain('MACHINE  0');
  });

  test('includes VIBRATO 1 (new-style)', () => {
    expect(output).toContain('VIBRATO  1');
  });

  test('includes MACRO 0 (VOLUME) for flat envelope', () => {
    expect(output).toContain('MACRO 0');
  });

  test('includes INST2A03 entries for each instrument', () => {
    const lines = output.split('\n').filter((l) => l.startsWith('INST2A03'));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.some((l) => l.includes('"lead"'))).toBe(true);
    expect(lines.some((l) => l.includes('"harmony"'))).toBe(true);
  });

  test('TRACK line has correct BPM as tempo and speed=6', () => {
    const trackLine = output.split('\n').find((l) => l.startsWith('TRACK'));
    expect(trackLine).toBeDefined();
    // TRACK rows speed tempo title
    expect(trackLine).toContain(' 6 150 ');
  });

  test('includes COLUMNS line', () => {
    expect(output).toContain('COLUMNS :');
  });

  test('includes ORDER table', () => {
    const orderLines = output.split('\n').filter((l) => l.startsWith('ORDER'));
    expect(orderLines.length).toBeGreaterThan(0);
  });

  test('pattern rows contain note conversions', () => {
    // C5 in BeatBax → C-3 in FTM
    expect(output).toContain('C-3');
    // E5 → E-3
    expect(output).toContain('E-3');
  });

  test('pattern rows contain instrument index 00', () => {
    expect(output).toContain(' 00 ');
  });

  test('pattern rows contain empty rows with "..."', () => {
    expect(output).toContain('...');
  });

  test('non-NES chip raises error', () => {
    const gbSong: SongLike = { ...makeNesSong(), chip: 'gameboy' };
    expect(() => writeFtmText(gbSong)).toThrow(/nes/i);
  });
});

describe('writeFtmText with effects', () => {
  test('arp effect appears in pattern row', () => {
    const song: SongLike = {
      chip: 'nes',
      bpm: 120,
      metadata: { name: 'arp test' },
      pats: { p: ['C4:4', '.', '.', '.'] },
      insts: { lead: { type: 'pulse1', duty: '25', env: '12,flat' } as any },
      seqs: {},
      channels: [
        {
          id: 1,
          defaultInstrument: 'lead',
          events: [
            {
              type: 'note',
              token: 'C4',
              instrument: 'lead',
              instProps: { type: 'pulse1' },
              effects: [{ type: 'arp', params: [3, 7] }],
              sourcePattern: 'p',
            },
            { type: 'sustain', sourcePattern: 'p' },
            { type: 'sustain', sourcePattern: 'p' },
            { type: 'sustain', sourcePattern: 'p' },
          ],
        },
      ],
    };
    const text = writeFtmText(song);
    expect(text).toContain('037');
  });

  test('cut effect appears in pattern row', () => {
    const song: SongLike = {
      chip: 'nes',
      bpm: 120,
      metadata: { name: 'cut test' },
      pats: { p: ['C4:4', '.', '.', '.'] },
      insts: { lead: { type: 'pulse1', duty: '25', env: '12,flat' } as any },
      seqs: {},
      channels: [
        {
          id: 1,
          defaultInstrument: 'lead',
          events: [
            {
              type: 'note',
              token: 'C4',
              instrument: 'lead',
              instProps: { type: 'pulse1' },
              effects: [{ type: 'cut', params: [3] }],
              sourcePattern: 'p',
            },
            { type: 'sustain', sourcePattern: 'p' },
            { type: 'sustain', sourcePattern: 'p' },
            { type: 'sustain', sourcePattern: 'p' },
          ],
        },
      ],
    };
    const text = writeFtmText(song);
    expect(text).toContain('S03');
  });
});

describe('writeFtmText with vol_env / arp_env macros', () => {
  test('vol_env produces correct MACRO VOLUME line', () => {
    const song: SongLike = {
      chip: 'nes',
      bpm: 120,
      metadata: { name: 'mac test' },
      pats: { p: ['C4'] },
      insts: {
        inst1: {
          type: 'pulse1',
          duty: '50',
          vol_env: '[15,12,8,4,2,1]',
        } as any,
      },
      seqs: {},
      channels: [
        {
          id: 1,
          defaultInstrument: 'inst1',
          events: [
            {
              type: 'note',
              token: 'C4',
              instrument: 'inst1',
              instProps: { type: 'pulse1', vol_env: '[15,12,8,4,2,1]' },
              effects: [],
              sourcePattern: 'p',
            },
          ],
        },
      ],
    };
    const text = writeFtmText(song);
    expect(text).toContain('MACRO 0');  // 0 = VOLUME
    expect(text).toContain('15 12 8 4 2 1');
  });

  test('arp_env produces MACRO ARPEGGIO line with correct values', () => {
    const song: SongLike = {
      chip: 'nes',
      bpm: 120,
      metadata: { name: 'arp test' },
      pats: { p: ['C4'] },
      insts: {
        inst1: {
          type: 'pulse1',
          duty: '50',
          arp_env: '[0,4,7|0]',
        } as any,
      },
      seqs: {},
      channels: [
        {
          id: 1,
          defaultInstrument: 'inst1',
          events: [
            {
              type: 'note',
              token: 'C4',
              instrument: 'inst1',
              instProps: { type: 'pulse1', arp_env: '[0,4,7|0]' },
              effects: [],
              sourcePattern: 'p',
            },
          ],
        },
      ],
    };
    const text = writeFtmText(song);
    expect(text).toContain('MACRO 1');  // 1 = ARPEGGIO
    expect(text).toContain('0 4 7');
  });
});
