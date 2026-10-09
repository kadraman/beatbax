/**
 * Pattern Grid timeline seek/loop (spec 014): pointer mapping, snapping
 * gestures, idle playhead placement, and transport Play routing.
 */

import {
  snapLoopRange,
  snapStepDown,
  snapStepNearest,
  type LoopRange,
} from '@beatbax/app-core/playback/playback-range';
import { getRequestedPlaybackRange } from '@beatbax/app-core/stores/playback-range.store';
import type { PlaybackManager } from '@beatbax/app-core/playback/playback-manager';

export interface StepSpan {
  startStep: number;
  endStep: number;
}

/** Cumulative step spans for a row of blocks sized by step count. */
export function rowStepSpans(counts: readonly number[]): StepSpan[] {
  let cursor = 0;
  return counts.map((count) => {
    const startStep = cursor;
    cursor += Math.max(1, count);
    return { startStep, endStep: cursor };
  });
}

/** Fractional global step under `clientX` on a track spanning `totalSteps`. */
export function stepFromClientX(
  clientX: number,
  trackRect: { left: number; width: number },
  totalSteps: number,
): number {
  if (trackRect.width <= 0 || totalSteps <= 0) return 0;
  const frac = Math.min(1, Math.max(0, (clientX - trackRect.left) / trackRect.width));
  return frac * totalSteps;
}

export type TimelineDragKind = 'new' | 'start' | 'loop-start' | 'loop-end';

export type TimelineGestureResult =
  | { kind: 'start'; startStep: number }
  | { kind: 'loop'; loop: LoopRange }
  | { kind: 'none' };

/**
 * Snap a ruler gesture to pattern boundaries.
 * - `new` click (not moved): pending start at the block start under the pointer.
 * - `new` drag: loop covering every block between anchor and pointer.
 * - `start` drag: move the pending start to the nearest boundary.
 * - `loop-start` / `loop-end` drag: move one loop edge, keeping at least one block.
 */
export function resolveTimelineGesture(
  kind: TimelineDragKind,
  anchorStep: number,
  currentStep: number,
  moved: boolean,
  boundaries: readonly number[],
  loop: LoopRange | null,
): TimelineGestureResult {
  if (kind === 'new') {
    if (!moved) return { kind: 'start', startStep: snapStepDown(anchorStep, boundaries) };
    const next = snapLoopRange(anchorStep, currentStep, boundaries);
    return next ? { kind: 'loop', loop: next } : { kind: 'none' };
  }
  if (kind === 'start') {
    return { kind: 'start', startStep: snapStepNearest(currentStep, boundaries) };
  }
  if (!loop) return { kind: 'none' };
  const edge = snapStepNearest(currentStep, boundaries);
  if (kind === 'loop-start') {
    const startStep = Math.min(edge, boundaries.filter((b) => b < loop.endStep).pop() ?? loop.startStep);
    return startStep < loop.endStep ? { kind: 'loop', loop: { startStep, endStep: loop.endStep } } : { kind: 'none' };
  }
  const endStep = Math.max(edge, boundaries.find((b) => b > loop.startStep) ?? loop.endStep);
  return endStep > loop.startStep ? { kind: 'loop', loop: { startStep: loop.startStep, endStep } } : { kind: 'none' };
}

/** Where the global playhead rests while stopped. */
export function idlePlayheadStep(state: {
  focusWindow?: StepSpan | null;
  loop?: LoopRange | null;
  startStep?: number | null;
}): number {
  if (state.focusWindow) return state.focusWindow.startStep;
  if (state.loop) return state.loop.startStep;
  return state.startStep ?? 0;
}

/**
 * Start transport playback from the Pattern Grid loop range or pending start.
 * Returns false when no range is set so the caller plays the whole song.
 */
export function tryPlayRequestedRange(
  playbackManager: Pick<PlaybackManager, 'playFrom' | 'playRange'>,
  getSource: () => string,
): boolean {
  const range = getRequestedPlaybackRange();
  if (!range) return false;
  const started = range.loop && typeof range.endStep === 'number'
    ? playbackManager.playRange(getSource(), { startStep: range.startStep, endStep: range.endStep, loop: true })
    : playbackManager.playFrom(getSource(), { startStep: range.startStep });
  // PlaybackManager already reports failures on the event bus.
  void started.catch(() => {});
  return true;
}
