import type { ArkosPattern, ArkosPosition, ArkosTrack } from './arkos-types.js';
import type { ChannelEventLike } from './arkos-types.js';
import { DEFAULT_MARKER_COLOR, DEFAULT_PATTERN_COLOR } from './arkos-types.js';
import { buildTrack } from './arkos-patterns.js';

export interface BuiltOrders {
  positions: ArkosPosition[];
  patterns: ArkosPattern[];
  tracks: ArkosTrack[];
}

/**
 * Build Arkos positions / patterns / tracks from aligned per-channel frames.
 *
 * Each song position becomes one Arkos pattern that references three tracks
 * (channels A/B/C). Track indices are allocated sequentially and deterministically.
 */
export function buildOrders(
  alignedFrames: Array<Array<ChannelEventLike[]>>,
  indexByName: Map<string, number>,
  defaultInstruments: Array<string | undefined>,
): BuiltOrders {
  const tracks: ArkosTrack[] = [];
  const patterns: ArkosPattern[] = [];
  const positions: ArkosPosition[] = [];

  const frameCount = alignedFrames[0]?.length ?? 0;
  for (let pos = 0; pos < frameCount; pos++) {
    const height = Math.max(
      1,
      alignedFrames[0][pos]?.length ?? 0,
      alignedFrames[1][pos]?.length ?? 0,
      alignedFrames[2][pos]?.length ?? 0,
    );

    const trackIndexes: number[] = [];
    for (let ch = 0; ch < 3; ch++) {
      const trackIndex = tracks.length;
      const frame = alignedFrames[ch]?.[pos] ?? [];
      tracks.push(
        buildTrack(trackIndex, frame, indexByName, defaultInstruments[ch]),
      );
      trackIndexes.push(trackIndex);
    }

    const patternIndex = patterns.length;
    patterns.push({
      index: patternIndex,
      trackIndexes,
      speedTrackIndex: 0,
      eventTrackIndex: 0,
      colorArgb: DEFAULT_PATTERN_COLOR,
    });

    positions.push({
      patternIndex,
      height,
      markerName: pos === 0 ? 'Start' : '',
      markerColor: DEFAULT_MARKER_COLOR,
      // AT3 only stores non-zero channel/value pairs; zeros must be omitted.
      transpositions: [],
    });
  }

  if (positions.length === 0) {
    // Degenerate empty song — one silent pattern.
    const trackIndexes = [0, 1, 2];
    for (let i = 0; i < 3; i++) {
      tracks.push({ index: i, cells: [] });
    }
    patterns.push({
      index: 0,
      trackIndexes,
      speedTrackIndex: 0,
      eventTrackIndex: 0,
      colorArgb: DEFAULT_PATTERN_COLOR,
    });
    positions.push({
      patternIndex: 0,
      height: 1,
      markerName: 'Start',
      markerColor: DEFAULT_MARKER_COLOR,
      transpositions: [],
    });
  }

  return { positions, patterns, tracks };
}
