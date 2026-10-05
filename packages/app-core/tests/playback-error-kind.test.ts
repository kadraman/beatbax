/**
 * `playback:error` carries a kind so consumers that must not see song text
 * (the desktop diagnostics log) can skip parse/import/resolve failures.
 */

import { parse } from '@beatbax/engine/parser';
import { resolveImports, resolveSong } from '@beatbax/engine/song';
import { Player } from '@beatbax/engine/audio/playback';
import { PlaybackManager } from '../src/playback/playback-manager';
import { EventBus, type BeatBaxEvents } from '../src/utils/event-bus';

jest.mock('@beatbax/engine/parser', () => {
  const actual = jest.requireActual('@beatbax/engine/parser');
  return { ...actual, parse: jest.fn(actual.parse) };
});

jest.mock('@beatbax/engine/song', () => {
  const actual = jest.requireActual('@beatbax/engine/song');
  return {
    ...actual,
    resolveImports: jest.fn(actual.resolveImports),
    resolveSong: jest.fn(actual.resolveSong),
  };
});

const song = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 E4
seq main = a
channel 1 => inst lead seq main
play`;

describe('playback error classification', () => {
  let eventBus: EventBus;
  let playbackManager: PlaybackManager;
  let errors: Array<BeatBaxEvents['playback:error']>;
  let parseErrors: Array<BeatBaxEvents['parse:error']>;

  beforeEach(() => {
    const MockAudioContext = jest.fn().mockImplementation(() => ({}));
    (globalThis as any).AudioContext = MockAudioContext;
    (window as any).AudioContext = MockAudioContext;

    eventBus = new EventBus();
    playbackManager = new PlaybackManager(eventBus);
    errors = [];
    parseErrors = [];
    eventBus.on('playback:error', (e) => errors.push(e));
    eventBus.on('parse:error', (e) => parseErrors.push(e));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    playbackManager.stop();
    eventBus.clear();
  });

  it('classifies parse failures as source errors', async () => {
    (parse as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Expected note but found "pat melody"');
    });
    await expect(playbackManager.play(song)).rejects.toThrow();
    expect(errors).toEqual([{ error: expect.any(Error), kind: 'source' }]);
  });

  it('classifies import failures as source errors and reports them once', async () => {
    const actualParse = jest.requireActual('@beatbax/engine/parser').parse;
    (parse as jest.Mock).mockImplementationOnce((src: string) => ({
      ...actualParse(src),
      imports: [{ source: 'local:missing.ins' }],
    }));
    (resolveImports as jest.Mock).mockRejectedValueOnce(new Error('missing.ins not found'));
    await expect(playbackManager.play(song)).rejects.toThrow(/Import failed/);
    expect(errors).toEqual([{ error: expect.any(Error), kind: 'source' }]);
    expect(parseErrors).toHaveLength(1);
  });

  it('classifies song resolution failures as source errors', async () => {
    (resolveSong as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Unknown instrument "lead2"');
    });
    await expect(playbackManager.play(song)).rejects.toThrow();
    expect(errors).toEqual([{ error: expect.any(Error), kind: 'source' }]);
  });

  it('classifies player failures as runtime errors', async () => {
    jest.spyOn(Player.prototype, 'playAST').mockRejectedValue(new Error('AudioContext failed'));
    await expect(playbackManager.play(song)).rejects.toThrow('AudioContext failed');
    expect(errors).toEqual([{ error: expect.any(Error), kind: 'runtime' }]);
  });
});
