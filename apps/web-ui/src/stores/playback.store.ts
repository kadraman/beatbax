/**
 * playback.store — reactive playback state (nanostores).
 *
 * Replaces scattered eventBus.emit('playback:*') patterns with typed reactive atoms.
 * Components subscribe once and re-render on change — no event-bus wiring needed.
 */

import { atom } from 'nanostores';

export type PlaybackStatus = 'stopped' | 'playing' | 'paused';

/** Current playback status. */
export const playbackStatus = atom<PlaybackStatus>('stopped');

/** Current BPM extracted from the parsed song. */
export const playbackBpm = atom<number>(120);

/** Current playback position in seconds. */
export const playbackPosition = atom<number>(0);

/** Total song duration in seconds (0 when unknown). */
export const playbackDuration = atom<number>(0);

/** Whether live-play mode is active. */
export const playbackLiveMode = atom<boolean>(false);

/** Formatted playback time string, e.g. "1:23". */
export const playbackTimeLabel = atom<string>('0:00');
