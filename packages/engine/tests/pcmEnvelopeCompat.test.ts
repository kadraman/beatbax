import { renderSongToPCM } from '../src/audio/pcmRenderer';
import { SongModel } from '../src/song/songModel';

describe('pcmRenderer envelope compatibility', () => {
  test('string vs structured GB envelope produce same PCM', () => {
    const songBase: Partial<SongModel> = {
      pats: {},
      seqs: {},
      bpm: 120,
      channels: [
        {
          id: 1,
          defaultInstrument: 'instStr',
          events: [ { type: 'note', token: 'C4', instrument: 'instStr' } ]
        },
        {
          id: 2,
          defaultInstrument: 'instObj',
          events: [ { type: 'note', token: 'C4', instrument: 'instObj' } ]
        }
      ] as any
    };

    const song: SongModel = {
      pats: songBase.pats as any,
      seqs: songBase.seqs as any,
      bpm: songBase.bpm as any,
      insts: {
        instStr: {
          type: 'noise',
          env: 'gb:12,down,1'
        },
        instObj: {
          type: 'noise',
          env: { mode: 'gb', initial: 12, direction: 'down', period: 1 }
        }
      } as any,
      channels: songBase.channels as any
    } as SongModel;

    const opts = { duration: 0.5, sampleRate: 22050, channels: 2 } as any;

    // Now render where both channels use the same instrument name but different envs
    const songA: SongModel = JSON.parse(JSON.stringify(song));
    const songB: SongModel = JSON.parse(JSON.stringify(song));

    // Render the two channels separately by swapping instruments
    // songA: channel 1 uses instStr, channel 2 silent
    songA.channels[1].events = [{ type: 'rest' }];
    // songB: channel 1 silent, channel 2 uses instObj
    songB.channels[0].events = [{ type: 'rest' }];

    const pcmA = renderSongToPCM(songA, opts);
    const pcmB = renderSongToPCM(songB, opts);

    // Compare lengths
    expect(pcmA.length).toEqual(pcmB.length);

    // Ensure sample values are effectively identical
    for (let i = 0; i < pcmA.length; i++) {
      expect(pcmA[i]).toBeCloseTo(pcmB[i], 6);
    }
  });
});
