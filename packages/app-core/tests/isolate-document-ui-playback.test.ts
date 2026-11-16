/**
 * isolateDocumentUi plays audio without driving Pattern Grid / Visualizer /
 * transport time, and without overwriting parsed chip/BPM (#268).
 */

import { PlaybackManager } from '../src/playback/playback-manager';
import { EventBus } from '../src/utils/event-bus';
import { parsedBpm, parsedChip } from '../src/stores/editor.store';
import { playbackBpm, playbackTimeLabel } from '../src/stores/playback.store';

describe('isolateDocumentUi playback', () => {
  let eventBus: EventBus;
  let playbackManager: PlaybackManager;

  beforeEach(() => {
    const MockAudioContext = jest.fn().mockImplementation(() => ({}));
    (globalThis as any).AudioContext = MockAudioContext;
    (window as any).AudioContext = MockAudioContext;

    eventBus = new EventBus();
    playbackManager = new PlaybackManager(eventBus);
    parsedBpm.set(128);
    parsedChip.set('gameboy');
    playbackBpm.set(128);
    playbackTimeLabel.set('1:23');
  });

  afterEach(() => {
    playbackManager.stop();
    eventBus.clear();
  });

  const previewSource = `chip nes
bpm 90
inst lead type=nes
pat a = C4
seq main = a
channel 1 => inst lead seq main
play`;

  it('marks parse:success as ephemeral and preserves open-song chip/BPM stores', async () => {
    const parses: Array<{ ephemeral?: boolean }> = [];
    eventBus.on('parse:success', (payload) => parses.push(payload));

    await playbackManager.play(previewSource, { isolateDocumentUi: true });

    expect(parses.length).toBeGreaterThanOrEqual(1);
    expect(parses[0].ephemeral).toBe(true);
    expect(parsedChip.get()).toBe('gameboy');
    expect(parsedBpm.get()).toBe(128);
    expect(playbackBpm.get()).toBe(128);
  });

  it('does not emit document playback position events', async () => {
    const positions: unknown[] = [];
    const channelPositions: unknown[] = [];
    eventBus.on('playback:position', (p) => positions.push(p));
    eventBus.on('playback:position-changed', (p) => channelPositions.push(p));

    await playbackManager.play(previewSource, { isolateDocumentUi: true });

    (playbackManager as any)._emitChannelPosition(1, 0, 4);
    (playbackManager as any)._emitElapsedPosition({
      _playbackStartTimestamp: Date.now() - 1000,
      _completionTimeoutMs: 4000,
      _isRepeatMode: false,
    });

    expect(positions).toHaveLength(0);
    expect(channelPositions).toHaveLength(0);
    expect(playbackTimeLabel.get()).toBe('1:23');
  });

  it('still emits playback:started and playback:stopped for preview lifecycle', async () => {
    const started = jest.fn();
    const stopped = jest.fn();
    eventBus.on('playback:started', started);
    eventBus.on('playback:stopped', stopped);

    await playbackManager.play(previewSource, { isolateDocumentUi: true });
    expect(started).toHaveBeenCalled();

    playbackManager.stop();
    expect(stopped).toHaveBeenCalled();
  });
});
