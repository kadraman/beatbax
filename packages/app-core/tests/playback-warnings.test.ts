/**
 * Chip plugin warnings raised during playback (e.g. a DMC sample that failed
 * to load) must reach the Output panel, not only the devtools console.
 */

import { Player } from '@beatbax/engine/audio/playback';
import { PlaybackManager } from '../src/playback/playback-manager';
import { EventBus } from '../src/utils/event-bus';

const song = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 E4
seq main = a
channel 1 => inst lead seq main
play`;

const dmcWarning = {
  component: 'nes-dmc',
  message: "NES DMC: failed to load sample 'https://example.com/snare.dmc': Remote asset host 'example.com' is not in the Desktop allowlist.",
};

describe('playback warnings', () => {
  let eventBus: EventBus;
  let playbackManager: PlaybackManager;

  beforeEach(() => {
    const MockAudioContext = jest.fn().mockImplementation(() => ({}));
    (globalThis as any).AudioContext = MockAudioContext;
    (window as any).AudioContext = MockAudioContext;

    eventBus = new EventBus();
    playbackManager = new PlaybackManager(eventBus);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    playbackManager.stop();
    eventBus.clear();
  });

  it('posts chip plugin warnings to the Output panel once per play', async () => {
    jest.spyOn(Player.prototype, 'playAST').mockImplementation(async function (this: Player) {
      this.onWarn?.(dmcWarning);
      this.onWarn?.(dmcWarning);
    });
    const messages: unknown[] = [];
    eventBus.on('output:message', (msg) => messages.push(msg));
    const onWarn = jest.fn();

    await playbackManager.play(song, { onWarn });

    expect(messages).toEqual([
      { type: 'warning', message: dmcWarning.message, source: 'playback', focus: true },
    ]);
    expect(onWarn).toHaveBeenCalledWith(dmcWarning);
  });

  it('reports the warning again on the next play', async () => {
    jest.spyOn(Player.prototype, 'playAST').mockImplementation(async function (this: Player) {
      this.onWarn?.(dmcWarning);
    });
    const messages: unknown[] = [];
    eventBus.on('output:message', (msg) => messages.push(msg));

    await playbackManager.play(song);
    await playbackManager.play(song);

    expect(messages).toHaveLength(2);
  });
});
