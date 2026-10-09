/**
 * Playback subsystem exports
 */

export { PlaybackManager } from './playback-manager.js';
export type { PlaybackState, PlaybackOptions } from './playback-manager.js';

export {
  songStepCount,
  normalizePlaybackRange,
  sliceSongForRange,
  collectStepBoundaries,
  snapStepDown,
  snapStepUp,
  snapStepNearest,
  snapLoopRange,
} from './playback-range.js';
export type {
  PlaybackRange,
  PlaybackSnapMode,
  LoopRange,
  NormalizedPlaybackRange,
  SlicedSong,
} from './playback-range.js';

export { TransportControls } from './transport-controls.js';
export type { TransportState, TransportControlsConfig } from './transport-controls.js';

export { attachTransportBarFit } from './transport-bar-fit.js';

