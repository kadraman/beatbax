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
import { playbackStatus } from '@beatbax/app-core/stores/playback.store';
import {
  getActivePlaybackLoopRange,
  getRequestedPlaybackRange,
  playbackLoopEnabled,
  playbackStartStep,
  setPlaybackLoopRange,
  setPlaybackStartStep,
} from '@beatbax/app-core/stores/playback-range.store';
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

/**
 * Snap a pending start to a block boundary. The song-end boundary is excluded
 * because playback cannot start there, so the latest start is the final block.
 */
export function snapPendingStart(
  step: number,
  boundaries: readonly number[],
  mode: 'down' | 'nearest',
): number {
  const starts = boundaries.length > 1 ? boundaries.slice(0, -1) : boundaries;
  return mode === 'down' ? snapStepDown(step, starts) : snapStepNearest(step, starts);
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
    if (!moved) return { kind: 'start', startStep: snapPendingStart(anchorStep, boundaries, 'down') };
    const next = snapLoopRange(anchorStep, currentStep, boundaries);
    return next ? { kind: 'loop', loop: next } : { kind: 'none' };
  }
  if (kind === 'start') {
    return { kind: 'start', startStep: snapPendingStart(currentStep, boundaries, 'nearest') };
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
 * Ruler click or start-flag drop. Sets the pending start and, like a DAW, moves
 * playback there: while playing it jumps to `startStep`; while paused it stops
 * so the next Play starts there. An active loop range is turned off;
 * `followActiveLoop` then moves loop playback to the new start.
 */
export function pickTimelineStart(startStep: number, deps: TimelinePickDeps): void {
  const transport = captureTransport(deps.playbackManager);

  deps.exitSectionFocus();
  setPlaybackStartStep(startStep);
  if (getActivePlaybackLoopRange()) playbackLoopEnabled.set(false);

  if (transport.paused) {
    deps.playbackManager.stop();
  } else if (transport.playing && !transport.loopPlaying) {
    void deps.playbackManager.playFrom(deps.getSource(), { startStep }).catch(() => {});
  }
}

/**
 * Ruler loop drag (new range or handle). Sets the range and turns Loop on for a
 * new range; `followActiveLoop` then moves running playback into it. While
 * paused it stops so the next Play starts at the loop start. Section focus
 * playback is stopped by exiting focus, so the jump is made here instead.
 */
export function pickTimelineLoop(
  loop: LoopRange,
  options: { enableLoop: boolean },
  deps: TimelinePickDeps,
): void {
  const transport = captureTransport(deps.playbackManager);

  deps.exitSectionFocus();
  setPlaybackLoopRange(loop);
  if (options.enableLoop) playbackLoopEnabled.set(true);

  const active = getActivePlaybackLoopRange();
  if (!active) return;
  if (transport.paused) {
    deps.playbackManager.stop();
  } else if (transport.playing && !deps.playbackManager.isPlaying()) {
    void deps.playbackManager.playRange(deps.getSource(), { ...active, loop: true }).catch(() => {});
  }
}

/**
 * Keep running playback on the active loop range. Run whenever the range or the
 * transport Loop toggle changes. A new or edited active range (including Loop
 * turned on) jumps into it; losing it (range cleared or Loop turned off)
 * continues whole-song from the pending start, else from the old loop start.
 * Paused playback and section focus playback are left alone.
 */
export function followActiveLoop(deps: {
  playbackManager: Pick<PlaybackManager, 'isPlaying' | 'getActiveRange' | 'playFrom' | 'playRange'>;
  getSource: () => string;
  isSectionFocusActive: () => boolean;
}): void {
  const { playbackManager } = deps;
  if (!playbackManager.isPlaying() || deps.isSectionFocusActive()) return;
  const current = playbackManager.getActiveRange();
  const next = getActivePlaybackLoopRange();
  if (next) {
    if (current?.loop && current.startStep === next.startStep && current.endStep === next.endStep) return;
    void playbackManager.playRange(deps.getSource(), { ...next, loop: true }).catch(() => {});
  } else if (current?.loop) {
    const startStep = playbackStartStep.get() ?? current.startStep;
    void playbackManager.playFrom(deps.getSource(), { startStep }).catch(() => {});
  }
}

export interface TimelinePickDeps {
  playbackManager: Pick<PlaybackManager, 'isPlaying' | 'getActiveRange' | 'playFrom' | 'playRange' | 'stop'>;
  getSource: () => string;
  /** Leaves section focus; stops any slice playback. */
  exitSectionFocus: () => void;
}

/** Read before exiting section focus, which stops playback. */
function captureTransport(playbackManager: TimelinePickDeps['playbackManager']): {
  playing: boolean;
  paused: boolean;
  loopPlaying: boolean;
} {
  const playing = playbackManager.isPlaying();
  return {
    playing,
    paused: !playing && playbackStatus.get() === 'paused',
    loopPlaying: playing && playbackManager.getActiveRange()?.loop === true,
  };
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
