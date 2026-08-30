/**
 * Ephemeral (slice/selection) playback must not mutate global channel mute/solo
 * for channels omitted from the temporary source.
 */

import { PlaybackManager } from '../src/playback/playback-manager';
import { EventBus } from '../src/utils/event-bus';
import * as channelStore from '../src/stores/channel.store';

describe('ephemeral playback channel store', () => {
  let eventBus: EventBus;
  let playbackManager: PlaybackManager;

  beforeEach(() => {
    const MockAudioContext = jest.fn().mockImplementation(() => ({}));
    (globalThis as any).AudioContext = MockAudioContext;
    (window as any).AudioContext = MockAudioContext;

    eventBus = new EventBus();
    playbackManager = new PlaybackManager(eventBus);
    channelStore.resetChannels();
    channelStore.setChannelMuted(3, true);
    jest.spyOn(channelStore, 'setChannelMuted');
    jest.spyOn(channelStore, 'setChannelSoloed');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    playbackManager.stop();
    eventBus.clear();
  });

  const twoChannelSlice = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=25 env=10,down
pat a = C4 E4
pat b = C2 E2
seq main = a
seq bass = b
channel 1 => inst lead seq main
channel 2 => inst bass seq bass
play`;

  it('ephemeral play preserves mute on channels omitted from the slice source', async () => {
    await playbackManager.play(twoChannelSlice, { ephemeral: true });

    expect(channelStore.channelStates.get()[2]?.muted).toBe(false);
    expect(channelStore.channelStates.get()[3]?.muted).toBe(true);
    expect(channelStore.setChannelMuted).not.toHaveBeenCalledWith(3, false);
    expect(channelStore.setChannelSoloed).not.toHaveBeenCalledWith(3, false);
  });

  it('full play still reconciles mute/solo for channels missing from the new song', async () => {
    await playbackManager.play(twoChannelSlice);

    expect(channelStore.setChannelMuted).toHaveBeenCalledWith(3, false);
    expect(channelStore.channelStates.get()[3]?.muted).toBe(false);
  });
});
