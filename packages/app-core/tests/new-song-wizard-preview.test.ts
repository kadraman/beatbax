import {
  NEW_SONG_WIZARD_PREVIEW_OPTIONS,
  playNewSongWizardPreview,
} from '../src/playback/new-song-wizard-preview.js';

describe('playNewSongWizardPreview', () => {
  it('plays with ephemeral + isolateDocumentUi so document chrome stays frozen (#268)', async () => {
    const play = jest.fn().mockResolvedValue(undefined);
    const unsub = jest.fn();
    const on = jest.fn().mockReturnValue(unsub);
    const onEnded = jest.fn();

    playNewSongWizardPreview({ play }, { on }, 'chip gameboy\n', onEnded);

    expect(NEW_SONG_WIZARD_PREVIEW_OPTIONS).toEqual({
      ephemeral: true,
      isolateDocumentUi: true,
    });
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('chip gameboy\n', NEW_SONG_WIZARD_PREVIEW_OPTIONS);
    expect(on).toHaveBeenCalledWith('playback:stopped', expect.any(Function));
    expect(onEnded).not.toHaveBeenCalled();

    const stoppedHandler = on.mock.calls[0][1] as () => void;
    stoppedHandler();
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('calls onEnded when play rejects', async () => {
    const play = jest.fn().mockRejectedValue(new Error('preview failed'));
    const unsub = jest.fn();
    const on = jest.fn().mockReturnValue(unsub);
    const onEnded = jest.fn();

    playNewSongWizardPreview({ play }, { on }, 'chip nes\n', onEnded);
    await Promise.resolve();
    await Promise.resolve();

    expect(unsub).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});
