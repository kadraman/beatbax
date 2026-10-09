/**
 * Pattern Grid seek and loop (spec 014, phases 1–3): range slicing, snapping,
 * session store, and PlaybackManager range playback in full-song coordinates.
 */

import { Player } from '@beatbax/engine/audio/playback';
import { PlaybackManager } from '../src/playback/playback-manager';
import {
  collectStepBoundaries,
  normalizePlaybackRange,
  sliceSongForRange,
  snapLoopRange,
  snapStepDown,
  snapStepNearest,
  snapStepUp,
  songStepCount,
} from '../src/playback/playback-range';
import {
  clampPlaybackRangeToSong,
  clearPlaybackRange,
  getRequestedPlaybackRange,
  playbackRangeMode,
  setPlaybackLoopRange,
  setPlaybackStartStep,
} from '../src/stores/playback-range.store';
import { EventBus } from '../src/utils/event-bus';

// Resolved-song fixture mirroring engine output for:
//   pat a = C4 E4 G4 C5 / pat b = inst(alt) D4 . F4 A4 / pat lo = C2 . . . C2 . . .
//   channel 1 => inst lead seq a b a ; channel 2 => inst bass seq lo lo
// The resolver stamps instrument + instProps on every note, so `inst(alt)` persists.
const mockInsts: Record<string, any> = {
  lead: { type: 'pulse1', duty: 50 },
  alt: { type: 'pulse1', duty: 25 },
  bass: { type: 'pulse2', duty: 25 },
};

function mockNote(token: string, instrument: string, pat: string): any {
  return { type: 'note', token, instrument, instProps: mockInsts[instrument], sourcePattern: pat, sourceSequence: 'main' };
}

function mockRest(pat: string): any {
  return { type: 'rest', sourcePattern: pat };
}

function mockResolvedSong(): any {
  const ch1 = [
    mockNote('C4', 'lead', 'a'), mockNote('E4', 'lead', 'a'), mockNote('G4', 'lead', 'a'), mockNote('C5', 'lead', 'a'),
    mockNote('D4', 'alt', 'b'), mockRest('b'), mockNote('F4', 'alt', 'b'), mockNote('A4', 'alt', 'b'),
    mockNote('C4', 'alt', 'a'), mockNote('E4', 'alt', 'a'), mockNote('G4', 'alt', 'a'), mockNote('C5', 'alt', 'a'),
  ];
  const lo = () => [
    mockNote('C2', 'bass', 'lo'), mockRest('lo'), mockRest('lo'), mockRest('lo'),
    mockNote('C2', 'bass', 'lo'), mockRest('lo'), mockRest('lo'), mockRest('lo'),
  ];
  const ch2 = [...lo(), ...lo()];
  return {
    chip: 'gameboy',
    bpm: 120,
    insts: mockInsts,
    pats: {},
    play: { repeat: false },
    channels: [
      { id: 1, events: ch1, pat: ch1, defaultInstrument: 'lead' },
      { id: 2, events: ch2, pat: ch2, defaultInstrument: 'bass' },
    ],
  };
}

jest.mock('@beatbax/engine/song', () => ({
  resolveSong: jest.fn(() => mockResolvedSong()),
  resolveImports: jest.fn(async (ast: any) => ast),
}));

const SONG = 'chip gameboy\nplay';
const resolve = (_source: string) => mockResolvedSong();

describe('playback range slicing', () => {
  it('counts global steps from the longest channel', () => {
    const song = resolve(SONG);
    expect(songStepCount(song)).toBe(16);
  });

  it('normalizes and rejects out-of-range requests', () => {
    expect(normalizePlaybackRange({ startStep: 4 }, 12)).toEqual({ startStep: 4, endStep: 12, loop: false });
    expect(normalizePlaybackRange({ startStep: 4, endStep: 99, loop: true }, 12)).toEqual({ startStep: 4, endStep: 12, loop: true });
    expect(normalizePlaybackRange({ startStep: 12 }, 12)).toBeNull();
    expect(normalizePlaybackRange({ startStep: 4, endStep: 4 }, 12)).toBeNull();
    expect(normalizePlaybackRange({ startStep: 0, loop: true }, 12)).toBeNull();
  });

  it('slices every channel to the same step window and counts note offsets', () => {
    const song = resolve(SONG);
    const sliced = sliceSongForRange(song, { startStep: 4, endStep: 8, loop: true })!;
    expect(sliced).not.toBeNull();
    for (const ch of sliced.song.channels) {
      expect(ch.events).toHaveLength(4);
      expect(ch.pat).toBe(ch.events);
    }
    expect(sliced.song.play.repeat).toBe(true);
    // Channel 1: pattern a (4 notes) precedes the slice. Channel 2: one C2 in steps 0–3.
    expect(sliced.noteOffsets.get(1)).toBe(4);
    expect(sliced.noteOffsets.get(2)).toBe(1);
    expect(sliced.noteTotals.get(1)).toBe(11);
    // Full song is untouched.
    expect(song.channels[0].events).toHaveLength(12);
  });

  it('keeps inline instrument state on events after the start step', () => {
    const song = resolve(SONG);
    const sliced = sliceSongForRange(song, { startStep: 4 })!;
    const first = sliced.song.channels[0].events[0];
    expect(first.type).toBe('note');
    expect(first.instrument).toBe('alt');
    expect(first.instProps).toMatchObject({ duty: 25 });
    expect(sliced.song.play.repeat).toBe(false);
  });
});

describe('step boundary snapping', () => {
  const rows = [
    [{ startStep: 0, endStep: 4 }, { startStep: 4, endStep: 8 }, { startStep: 8, endStep: 12 }],
    [{ startStep: 0, endStep: 8 }, { startStep: 8, endStep: 16 }],
  ];
  const boundaries = collectStepBoundaries(rows, 16);

  it('collects unique sorted boundaries across rows', () => {
    expect(boundaries).toEqual([0, 4, 8, 12, 16]);
  });

  it('snaps down, up, and to the nearest boundary', () => {
    expect(snapStepDown(6, boundaries)).toBe(4);
    expect(snapStepUp(6, boundaries)).toBe(8);
    expect(snapStepNearest(5, boundaries)).toBe(4);
    expect(snapStepNearest(7, boundaries)).toBe(8);
    expect(snapStepUp(20, boundaries)).toBe(16);
  });

  it('snaps a dragged loop outward and keeps at least one block', () => {
    expect(snapLoopRange(9, 5, boundaries)).toEqual({ startStep: 4, endStep: 12 });
    expect(snapLoopRange(4, 4, boundaries)).toEqual({ startStep: 4, endStep: 8 });
    expect(snapLoopRange(16, 16, boundaries)).toBeNull();
  });
});

describe('playback range store', () => {
  afterEach(() => clearPlaybackRange());

  it('prefers an active loop range over a pending start', () => {
    expect(getRequestedPlaybackRange()).toBeNull();
    expect(playbackRangeMode.get()).toBe('off');

    setPlaybackStartStep(8);
    expect(playbackRangeMode.get()).toBe('pending-start');
    expect(getRequestedPlaybackRange()).toEqual({ startStep: 8, snap: 'pattern' });

    setPlaybackLoopRange({ startStep: 4, endStep: 12 });
    expect(playbackRangeMode.get()).toBe('loop');
    expect(getRequestedPlaybackRange()).toEqual({ startStep: 4, endStep: 12, loop: true, snap: 'pattern' });
  });

  it('treats a start of 0 as no pending start and rejects empty loops', () => {
    setPlaybackStartStep(0);
    setPlaybackLoopRange({ startStep: 8, endStep: 8 });
    expect(playbackRangeMode.get()).toBe('off');
  });

  it('drops range state that no longer fits a shorter song', () => {
    setPlaybackStartStep(12);
    setPlaybackLoopRange({ startStep: 8, endStep: 16 });
    clampPlaybackRangeToSong(10);
    expect(getRequestedPlaybackRange()).toBeNull();
  });
});

describe('PlaybackManager range playback', () => {
  let eventBus: EventBus;
  let manager: PlaybackManager;
  let playedAst: any;

  beforeEach(() => {
    const MockAudioContext = jest.fn().mockImplementation(() => ({}));
    (globalThis as any).AudioContext = MockAudioContext;
    (window as any).AudioContext = MockAudioContext;
    playedAst = null;
    jest.spyOn(Player.prototype, 'playAST').mockImplementation(async (ast: any) => { playedAst = ast; });
    jest.spyOn(Player.prototype, 'stop').mockImplementation(() => {});
    eventBus = new EventBus();
    manager = new PlaybackManager(eventBus);
  });

  afterEach(() => {
    manager.stop();
    jest.restoreAllMocks();
    eventBus.clear();
  });

  it('playFrom schedules from the start step and reports full-song positions', async () => {
    const positions: Array<{ current: number; total: number }> = [];
    const channelPositions = new Map<number, any>();
    const parsed: any[] = [];
    eventBus.on('playback:position', (p) => positions.push(p));
    eventBus.on('playback:position-changed', ({ channelId, position }) => channelPositions.set(channelId, position));
    eventBus.on('parse:success', (p) => parsed.push(p));

    await manager.playFrom(SONG, { startStep: 8 });

    expect(playedAst.channels[0].events).toHaveLength(4);
    expect(playedAst.channels[1].events).toHaveLength(8);
    expect(playedAst.play.repeat).toBe(false);
    // Grid still receives the full song.
    expect(parsed[0].song.channels[0].events).toHaveLength(12);
    expect(parsed[0].ephemeral).toBe(false);

    const stepSec = 60 / 120 / 4;
    expect(positions[0].current).toBeCloseTo(8 * stepSec, 2);
    expect(positions[0].total).toBeCloseTo(16 * stepSec, 5);

    // Channel 1: 7 notes in a + b precede step 8 (b has one rest).
    expect(channelPositions.get(1)).toMatchObject({ eventIndex: 7, totalEvents: 11, currentPattern: 'a' });
    expect(manager.getActiveRange()).toEqual({ startStep: 8, endStep: 16, loop: false });
  });

  it('playRange loops the selected window inside the engine', async () => {
    await manager.playRange(SONG, { startStep: 4, endStep: 8 });
    expect(playedAst.play.repeat).toBe(true);
    expect(playedAst.channels.every((ch: any) => ch.events.length === 4)).toBe(true);
    expect(manager.getActiveRange()).toEqual({ startStep: 4, endStep: 8, loop: true });
  });

  it('whole-song play is unchanged and stop clears the range', async () => {
    await manager.playRange(SONG, { startStep: 4, endStep: 8 });
    manager.stop();
    expect(manager.getActiveRange()).toBeNull();

    await manager.play(SONG);
    expect(playedAst.channels[0].events).toHaveLength(12);
    expect(manager.getActiveRange()).toBeNull();
  });

  it('falls back to whole-song playback for an out-of-range request', async () => {
    await manager.playFrom(SONG, { startStep: 64 });
    expect(playedAst.channels[0].events).toHaveLength(12);
    expect(manager.getActiveRange()).toBeNull();
  });
});
