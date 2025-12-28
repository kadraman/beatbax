import { renderSongToPCM } from '../src/audio/pcmRenderer';
import { SongModel } from '../src/song/songModel';

describe('pcmRenderer', () => {
  test('renderSongToPCM handles very small sweep time without division by zero', () => {
    const song: SongModel = {
      pats: {},
      seqs: {},
      bpm: 120,
      insts: {
        'sweepInst': {
          type: 'pulse1',
          duty: '0.5',
          env: '15,down,0',
          sweep: '1,up,1' // Smallest non-zero sweep time
        }
      },
      channels: [
        {
          id: 1,
          defaultInstrument: 'sweepInst',
          events: [
            { type: 'note', token: 'C4', instrument: 'sweepInst' }
          ]
        }
      ]
    };

    // This should not throw "RangeError: Division by zero" or similar
    expect(() => {
      renderSongToPCM(song, { duration: 0.1, sampleRate: 44100 });
    }).not.toThrow();
  });

  test('renderSongToPCM handles zero sweep time', () => {
    const song: SongModel = {
      pats: {},
      seqs: {},
      bpm: 120,
      insts: {
        'sweepInst': {
          type: 'pulse1',
          duty: '0.5',
          env: '15,down,0',
          sweep: '0,up,1' // Zero sweep time
        }
      },
      channels: [
        {
          id: 1,
          defaultInstrument: 'sweepInst',
          events: [
            { type: 'note', token: 'C4', instrument: 'sweepInst' }
          ]
        }
      ]
    };

    expect(() => {
      renderSongToPCM(song, { duration: 0.1, sampleRate: 44100 });
    }).not.toThrow();
  });
});
