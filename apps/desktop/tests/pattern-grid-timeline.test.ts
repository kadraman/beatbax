/**
 * Pattern Grid seek/loop timeline helpers (spec 014, phases 1–3).
 */

import { collectStepBoundaries } from '@beatbax/app-core/playback/playback-range';
import {
  clearPlaybackRange,
  setPlaybackLoopRange,
  setPlaybackStartStep,
} from '@beatbax/app-core/stores/playback-range.store';
import {
  idlePlayheadStep,
  resolveTimelineGesture,
  rowStepSpans,
  stepFromClientX,
  tryPlayRequestedRange,
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

  afterEach(() => clearPlaybackRange());

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

  it('a loop range takes precedence over the pending start', () => {
    const manager = makeManager();
    setPlaybackStartStep(8);
    setPlaybackLoopRange({ startStep: 4, endStep: 12 });
    expect(tryPlayRequestedRange(manager, () => 'src')).toBe(true);
    expect(manager.playRange).toHaveBeenCalledWith('src', { startStep: 4, endStep: 12, loop: true });
    expect(manager.playFrom).not.toHaveBeenCalled();
  });
});
