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
  clampStartStep,
  snapLoopRangeBySteps,
  sliceChannelEventsForRange,
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

export {
  rowStepSpans,
  stepFromClientX,
  snapPendingStart,
  resolveTimelineGesture,
  idlePlayheadStep,
  pickTimelineStart,
  pickTimelineLoop,
  followActiveLoop,
  tryPlayRequestedRange,
} from './pattern-grid-timeline.js';
export type {
  StepSpan,
  TimelineDragKind,
  TimelineGestureResult,
  TimelineGestureOptions,
  TimelinePickDeps,
} from './pattern-grid-timeline.js';

export {
  DEFAULT_MIN_PX_PER_STEP,
  DEFAULT_MAX_PX_PER_STEP,
  DEFAULT_ZOOM_FACTOR,
  fitPxPerStep,
  resolveAutoPxPerStep,
  clampPxPerStep,
  contentWidth,
  zoomAboutAnchor,
  steppedPxPerStep,
  edgeAutoscrollDelta,
} from './pattern-grid-zoom.js';


