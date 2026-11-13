import { localSampleRemainder, songDirectory } from '../src/editor/instrument-sample-path';

describe('localSampleRemainder', () => {
  it('requires a saved song path', () => {
    expect(localSampleRemainder('C:/songs/kick.dmc', null).ok).toBe(false);
    expect(localSampleRemainder('C:/songs/kick.dmc', '  ').ok).toBe(false);
  });

  it('returns a relative remainder for a file inside the song folder', () => {
    expect(localSampleRemainder(
      'C:/songs/nes/samples/kick.dmc',
      'C:/songs/nes/tune.bax',
    )).toEqual({ ok: true, remainder: 'samples/kick.dmc' });
  });

  it('keeps the picked casing and accepts a Windows path that walks back into the song folder', () => {
    expect(localSampleRemainder(
      'C:\\songs\\nes\\..\\nes\\My Samples\\Kick.dmc',
      'c:/songs/nes/tune.bax',
    )).toEqual({ ok: true, remainder: 'My Samples/Kick.dmc' });
  });

  it('rejects a file outside the song folder', () => {
    const outside = localSampleRemainder('C:/other/kick.dmc', 'C:/songs/nes/tune.bax');
    expect(outside.ok).toBe(false);
    const parent = localSampleRemainder('C:/songs/kick.dmc', 'C:/songs/nes/tune.bax');
    expect(parent.ok).toBe(false);
  });

  it('exposes the song directory for the file dialog', () => {
    expect(songDirectory('C:/songs/nes/tune.bax')).toBe('C:/songs/nes');
    expect(songDirectory('/music/tune.bax')).toBe('/music');
  });
});
