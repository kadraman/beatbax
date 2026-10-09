/**
 * playback-range.store — Pattern Grid pending start + loop range (spec 014).
 *
 * Session-only: not persisted, cleared when a different song is loaded.
 * Steps use the Pattern Grid / ISM global step coordinate system.
 */

import { atom, computed } from 'nanostores';
import type { LoopRange, PlaybackRange } from '../playback/playback-range.js';

export type PlaybackRangeMode = 'off' | 'pending-start' | 'loop';

/** Pending start step while stopped; null (or 0) means "from the beginning". */
export const playbackStartStep = atom<number | null>(null);

/** Selected loop range `[startStep, endStep)`; null when no loop is set. */
export const playbackLoopRange = atom<LoopRange | null>(null);

export const playbackRangeMode = computed(
  [playbackStartStep, playbackLoopRange],
  (start, loop): PlaybackRangeMode => {
    if (loop) return 'loop';
    if (start !== null && start > 0) return 'pending-start';
    return 'off';
  },
);

export function setPlaybackStartStep(step: number | null): void {
  playbackStartStep.set(step !== null && step > 0 ? Math.floor(step) : null);
}

export function setPlaybackLoopRange(range: LoopRange | null): void {
  if (!range || range.endStep <= range.startStep) {
    playbackLoopRange.set(null);
    return;
  }
  playbackLoopRange.set({ startStep: Math.max(0, range.startStep), endStep: range.endStep });
}

export function clearPlaybackLoopRange(): void {
  playbackLoopRange.set(null);
}

export function clearPlaybackRange(): void {
  playbackStartStep.set(null);
  playbackLoopRange.set(null);
}

/**
 * Drop range state that no longer fits a song with `totalSteps` steps
 * (for example after an edit shortens the song).
 */
export function clampPlaybackRangeToSong(totalSteps: number): void {
  const start = playbackStartStep.get();
  if (start !== null && start >= totalSteps) playbackStartStep.set(null);
  const loop = playbackLoopRange.get();
  if (loop && (loop.endStep > totalSteps || loop.startStep >= totalSteps)) playbackLoopRange.set(null);
}

/** Range to hand to `PlaybackManager` for the next Play, or null for whole-song playback. */
export function getRequestedPlaybackRange(): PlaybackRange | null {
  const loop = playbackLoopRange.get();
  if (loop) return { startStep: loop.startStep, endStep: loop.endStep, loop: true, snap: 'pattern' };
  const start = playbackStartStep.get();
  if (start !== null && start > 0) return { startStep: start, snap: 'pattern' };
  return null;
}
