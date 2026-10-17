/**
 * Pattern Grid seek/loop timeline helpers (spec 014, phases 1–4).
 */

import { collectStepBoundaries } from '@beatbax/app-core/playback/playback-range';
import { playbackStatus } from '@beatbax/app-core/stores/playback.store';
import {
  clearPlaybackRange,
  playbackLoopEnabled,
  playbackStartStep,
  setPlaybackLoopRange,
  setPlaybackStartStep,
} from '@beatbax/app-core/stores/playback-range.store';
import {
  followActiveLoop,
  idlePlayheadStep,
  pickTimelineLoop,
  pickTimelineStart,
  resolveTimelineGesture,
  rowStepSpans,
  snapPendingStart,
  stepFromClientX,
  tryPlayRequestedRange,
  type TimelinePickDeps,
} from '../src/renderer/src/lib/pattern-grid-timeline';

describe('pattern grid timeline mapping', () => {
  it('builds cumulative block spans in global step units', () => {
    expect(rowStepSpans([4, 4, 8])).toEqual([
      { startStep: 0, endStep: 4 },
      { startStep: 4, endStep: 8 },
      { startStep: 8, endStep: 16 },
    ]);
  });

  it('maps pointer x on the ruler track to a fractional global step', () => {
    const rect = { left: 100, width: 400 };
    expect(stepFromClientX(100, rect, 32)).toBe(0);
    expect(stepFromClientX(300, rect, 32)).toBe(16);
    expect(stepFromClientX(50, rect, 32)).toBe(0);
    expect(stepFromClientX(900, rect, 32)).toBe(32);
  });
});

describe('ruler gestures snap to pattern boundaries', () => {
  // Channel 1: 8 + 8 + 8 ; Channel 2: 4 x 6 → boundaries every 4 steps up to 24.
  const boundaries = collectStepBoundaries(
    [rowStepSpans([8, 8, 8]), rowStepSpans([4, 4, 4, 4, 4, 4])],
    24,
  );

  it('click sets the pending start at the block start under the pointer', () => {
    expect(resolveTimelineGesture('new', 10.6, 10.6, false, boundaries, null))
      .toEqual({ kind: 'start', startStep: 8 });
  });

  it('drag creates a loop covering every touched block', () => {
    expect(resolveTimelineGesture('new', 5, 13, true, boundaries, null))
      .toEqual({ kind: 'loop', loop: { startStep: 4, endStep: 16 } });
    expect(resolveTimelineGesture('new', 13, 5, true, boundaries, null))
      .toEqual({ kind: 'loop', loop: { startStep: 4, endStep: 16 } });
  });

  it('dragging the start flag moves it to the nearest boundary', () => {
    expect(resolveTimelineGesture('start', 8, 13.5, true, boundaries, null))
      .toEqual({ kind: 'start', startStep: 12 });
  });

  it('a pending start never lands on the song end', () => {
    // Latter half of the final block (20–24) would snap nearest to 24.
    expect(resolveTimelineGesture('start', 8, 23, true, boundaries, null))
      .toEqual({ kind: 'start', startStep: 20 });
    // Exact right edge of the ruler.
    expect(resolveTimelineGesture('new', 24, 24, false, boundaries, null))
      .toEqual({ kind: 'start', startStep: 20 });
    expect(snapPendingStart(24, boundaries, 'down')).toBe(20);
    expect(snapPendingStart(24, boundaries, 'nearest')).toBe(20);
    expect(snapPendingStart(21, boundaries, 'nearest')).toBe(20);
    expect(snapPendingStart(0, [0], 'down')).toBe(0);
  });

  it('Alt/step snap places starts and loops on integer steps (phase 4)', () => {
    expect(resolveTimelineGesture('new', 10.6, 10.6, false, boundaries, null, { snap: 'step' }))
      .toEqual({ kind: 'start', startStep: 10 });
    expect(resolveTimelineGesture('start', 8, 13.4, true, boundaries, null, { snap: 'step' }))
      .toEqual({ kind: 'start', startStep: 13 });
    expect(resolveTimelineGesture('new', 5.2, 7.1, true, boundaries, null, { snap: 'step' }))
      .toEqual({ kind: 'loop', loop: { startStep: 5, endStep: 8 } });
    expect(resolveTimelineGesture('new', 23.9, 23.9, false, boundaries, null, { snap: 'step' }))
      .toEqual({ kind: 'start', startStep: 23 });
    const loop = { startStep: 8, endStep: 16 };
    expect(resolveTimelineGesture('loop-start', 8, 10.6, true, boundaries, loop, { snap: 'step' }))
      .toEqual({ kind: 'loop', loop: { startStep: 11, endStep: 16 } });
    expect(resolveTimelineGesture('loop-end', 16, 12.4, true, boundaries, loop, { snap: 'step' }))
      .toEqual({ kind: 'loop', loop: { startStep: 8, endStep: 12 } });
    expect(snapPendingStart(23.2, boundaries, 'down', 'step')).toBe(23);
  });

  it('loop handles keep at least one block', () => {
    const loop = { startStep: 8, endStep: 16 };
    expect(resolveTimelineGesture('loop-start', 8, 2.5, true, boundaries, loop))
      .toEqual({ kind: 'loop', loop: { startStep: 4, endStep: 16 } });
    expect(resolveTimelineGesture('loop-start', 8, 20, true, boundaries, loop))
      .toEqual({ kind: 'loop', loop: { startStep: 12, endStep: 16 } });
    expect(resolveTimelineGesture('loop-end', 16, 23, true, boundaries, loop))
      .toEqual({ kind: 'loop', loop: { startStep: 8, endStep: 24 } });
    expect(resolveTimelineGesture('loop-end', 16, 1, true, boundaries, loop))
      .toEqual({ kind: 'loop', loop: { startStep: 8, endStep: 12 } });
    expect(resolveTimelineGesture('loop-end', 16, 20, true, boundaries, null)).toEqual({ kind: 'none' });
  });
});

describe('idle playhead placement', () => {
  it('prefers section focus, then loop start, then pending start, then 0', () => {
    expect(idlePlayheadStep({})).toBe(0);
    expect(idlePlayheadStep({ startStep: 8 })).toBe(8);
    expect(idlePlayheadStep({ startStep: 8, loop: { startStep: 4, endStep: 12 } })).toBe(4);
    expect(idlePlayheadStep({
      startStep: 8,
      loop: { startStep: 4, endStep: 12 },
      focusWindow: { startStep: 16, endStep: 24 },
    })).toBe(16);
  });
});

type RangeManager = Parameters<typeof tryPlayRequestedRange>[0];

describe('transport Play routing', () => {
  const makeManager = (): RangeManager & { playFrom: jest.Mock; playRange: jest.Mock } => ({
    playFrom: jest.fn(async () => {}),
    playRange: jest.fn(async () => {}),
  });

  afterEach(() => {
    clearPlaybackRange();
    playbackLoopEnabled.set(false);
  });

  it('falls through to whole-song play when no range is set', () => {
    const manager = makeManager();
    expect(tryPlayRequestedRange(manager, () => 'src')).toBe(false);
    expect(manager.playFrom).not.toHaveBeenCalled();
    expect(manager.playRange).not.toHaveBeenCalled();
  });

  it('plays from the pending start', () => {
    const manager = makeManager();
    setPlaybackStartStep(8);
    expect(tryPlayRequestedRange(manager, () => 'src')).toBe(true);
    expect(manager.playFrom).toHaveBeenCalledWith('src', { startStep: 8 });
  });

  it('a loop range takes precedence over the pending start while Loop is on', () => {
    const manager = makeManager();
    playbackLoopEnabled.set(true);
    setPlaybackStartStep(8);
    setPlaybackLoopRange({ startStep: 4, endStep: 12 });
    expect(tryPlayRequestedRange(manager, () => 'src')).toBe(true);
    expect(manager.playRange).toHaveBeenCalledWith('src', { startStep: 4, endStep: 12, loop: true });
    expect(manager.playFrom).not.toHaveBeenCalled();
  });

  it('ignores the loop range while Loop is off', () => {
    const manager = makeManager();
    setPlaybackLoopRange({ startStep: 4, endStep: 12 });
    expect(tryPlayRequestedRange(manager, () => 'src')).toBe(false);
    setPlaybackStartStep(8);
    expect(tryPlayRequestedRange(manager, () => 'src')).toBe(true);
    expect(manager.playFrom).toHaveBeenCalledWith('src', { startStep: 8 });
    expect(manager.playRange).not.toHaveBeenCalled();
  });
});

type PickManager = TimelinePickDeps['playbackManager'];
type MockPickManager = PickManager & { playFrom: jest.Mock; playRange: jest.Mock; stop: jest.Mock };

const makePickManager = (state: { playing: boolean; loop?: boolean }): MockPickManager => ({
  isPlaying: () => state.playing,
  getActiveRange: () => (state.loop ? { startStep: 4, endStep: 12, loop: true } : null),
  playFrom: jest.fn(async () => {}),
  playRange: jest.fn(async () => {}),
  stop: jest.fn(),
});

const resetTransport = (): void => {
  clearPlaybackRange();
  playbackLoopEnabled.set(false);
  playbackStatus.set('stopped');
};

describe('ruler click seeks like a DAW', () => {
  const makeManager = makePickManager;
  const pick = (manager: PickManager, step: number, exitSectionFocus = jest.fn()): jest.Mock => {
    pickTimelineStart(step, { playbackManager: manager, getSource: () => 'src', exitSectionFocus });
    return exitSectionFocus;
  };

  afterEach(resetTransport);

  it('while stopped, only sets the pending start', () => {
    const manager = makeManager({ playing: false });
    const exit = pick(manager, 8);
    expect(exit).toHaveBeenCalled();
    expect(playbackStartStep.get()).toBe(8);
    expect(manager.playFrom).not.toHaveBeenCalled();
    expect(manager.stop).not.toHaveBeenCalled();
  });

  it('while playing, jumps to the picked start (before or after the playhead)', () => {
    const manager = makeManager({ playing: true });
    playbackStatus.set('playing');
    pick(manager, 16);
    pick(manager, 0);
    expect(manager.playFrom).toHaveBeenNthCalledWith(1, 'src', { startStep: 16 });
    expect(manager.playFrom).toHaveBeenNthCalledWith(2, 'src', { startStep: 0 });
  });

  it('while paused, stops so the next Play starts at the picked start', () => {
    const manager = makeManager({ playing: false });
    playbackStatus.set('paused');
    pick(manager, 8);
    expect(manager.stop).toHaveBeenCalled();
    expect(manager.playFrom).not.toHaveBeenCalled();
    expect(playbackStartStep.get()).toBe(8);
  });

  it('while a loop range plays, turns Loop off and leaves the restart to the loop listener', () => {
    const manager = makeManager({ playing: true, loop: true });
    playbackStatus.set('playing');
    playbackLoopEnabled.set(true);
    setPlaybackLoopRange({ startStep: 4, endStep: 12 });
    pick(manager, 16);
    expect(playbackLoopEnabled.get()).toBe(false);
    expect(playbackStartStep.get()).toBe(16);
    expect(manager.playFrom).not.toHaveBeenCalled();
  });
});

describe('ruler loop drag moves playback into the range', () => {
  const loop = { startStep: 8, endStep: 16 };
  const pickLoop = (manager: PickManager, enableLoop: boolean, exitSectionFocus = jest.fn()): jest.Mock => {
    pickTimelineLoop(loop, { enableLoop }, { playbackManager: manager, getSource: () => 'src', exitSectionFocus });
    return exitSectionFocus;
  };

  afterEach(resetTransport);

  it('a new range while stopped turns Loop on without starting playback', () => {
    const manager = makePickManager({ playing: false });
    expect(pickLoop(manager, true)).toHaveBeenCalled();
    expect(playbackLoopEnabled.get()).toBe(true);
    expect(manager.playRange).not.toHaveBeenCalled();
  });

  it('a new range during whole-song playback leaves the jump to followActiveLoop', () => {
    const manager = makePickManager({ playing: true });
    playbackStatus.set('playing');
    pickLoop(manager, true);
    expect(playbackLoopEnabled.get()).toBe(true);
    expect(manager.playRange).not.toHaveBeenCalled();
  });

  it('a new range during section focus playback jumps into the loop after focus exits', () => {
    const state = { playing: true };
    const manager = makePickManager(state);
    playbackStatus.set('playing');
    pickLoop(manager, true, jest.fn(() => { state.playing = false; }));
    expect(manager.playRange).toHaveBeenCalledWith('src', { ...loop, loop: true });
  });

  it('a new range while paused stops so Play starts at the loop start', () => {
    const manager = makePickManager({ playing: false });
    playbackStatus.set('paused');
    pickLoop(manager, true);
    expect(manager.stop).toHaveBeenCalled();
    expect(manager.playRange).not.toHaveBeenCalled();
  });

  it('while a loop already plays, leaves the restart to followActiveLoop', () => {
    const manager = makePickManager({ playing: true, loop: true });
    playbackStatus.set('playing');
    playbackLoopEnabled.set(true);
    pickLoop(manager, true);
    expect(manager.playRange).not.toHaveBeenCalled();
  });

  it('a handle drag on a range with Loop off leaves playback alone', () => {
    const manager = makePickManager({ playing: true });
    playbackStatus.set('playing');
    pickLoop(manager, false);
    expect(playbackLoopEnabled.get()).toBe(false);
    expect(manager.playRange).not.toHaveBeenCalled();
    expect(manager.stop).not.toHaveBeenCalled();
  });
});

describe('running playback follows the active loop range', () => {
  const follow = (manager: PickManager, focusActive = false): void => {
    followActiveLoop({ playbackManager: manager, getSource: () => 'src', isSectionFocusActive: () => focusActive });
  };

  afterEach(resetTransport);

  it('Loop turned on during whole-song playback jumps into the range', () => {
    const manager = makePickManager({ playing: true });
    setPlaybackLoopRange({ startStep: 8, endStep: 16 });
    follow(manager);
    expect(manager.playRange).not.toHaveBeenCalled();
    playbackLoopEnabled.set(true);
    follow(manager);
    expect(manager.playRange).toHaveBeenCalledWith('src', { startStep: 8, endStep: 16, loop: true });
  });

  it('an edited range restarts on it; an unchanged range does not restart', () => {
    const manager = makePickManager({ playing: true, loop: true });
    playbackLoopEnabled.set(true);
    setPlaybackLoopRange({ startStep: 4, endStep: 12 });
    follow(manager);
    expect(manager.playRange).not.toHaveBeenCalled();
    setPlaybackLoopRange({ startStep: 4, endStep: 16 });
    follow(manager);
    expect(manager.playRange).toHaveBeenCalledWith('src', { startStep: 4, endStep: 16, loop: true });
  });

  it('losing the active range continues from the pending start, else the old loop start', () => {
    const manager = makePickManager({ playing: true, loop: true });
    follow(manager);
    expect(manager.playFrom).toHaveBeenLastCalledWith('src', { startStep: 4 });
    setPlaybackStartStep(20);
    follow(manager);
    expect(manager.playFrom).toHaveBeenLastCalledWith('src', { startStep: 20 });
  });

  it('leaves stopped, paused, and section focus playback alone', () => {
    playbackLoopEnabled.set(true);
    setPlaybackLoopRange({ startStep: 8, endStep: 16 });
    const stopped = makePickManager({ playing: false });
    follow(stopped);
    const focused = makePickManager({ playing: true });
    follow(focused, true);
    expect(stopped.playRange).not.toHaveBeenCalled();
    expect(focused.playRange).not.toHaveBeenCalled();
  });
});
