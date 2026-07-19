import { buildInstruments } from './arkos-instruments.js';
import { buildOrders } from './arkos-orders.js';
import { alignChannelFrames } from './arkos-patterns.js';
import {
  AY_CLOCK_CPC,
  AY_CLOCK_SPECTRUM_128,
  AY_TICK_RATE_HZ,
  CPC_CHIP_ALIASES,
  type ArkosSong,
  type SongLike,
} from './arkos-types.js';

function escapeComment(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function resolveAyClockHz(song: SongLike): number {
  const chip = String(song.chip ?? '').toLowerCase();
  if (CPC_CHIP_ALIASES.has(chip)) return AY_CLOCK_CPC;
  return AY_CLOCK_SPECTRUM_128;
}

/**
 * Derive Arkos initialSpeed so that one BeatBax tick ≈ one Arkos row at 50 Hz,
 * assuming a 16th-note grid (4 ticks per beat).
 */
export function deriveInitialSpeed(bpm: number | undefined): number {
  const safeBpm = Number.isFinite(bpm) && (bpm as number) > 0 ? (bpm as number) : 120;
  const speed = Math.round((AY_TICK_RATE_HZ * 60) / (safeBpm * 4));
  return Math.max(1, Math.min(255, speed));
}

/**
 * Lower a resolved BeatBax Spectrum/CPC song into an Arkos intermediate model.
 */
export function lowerToArkos(song: SongLike): ArkosSong {
  const { instruments, indexByName } = buildInstruments(song);
  const aligned = alignChannelFrames(song);
  const channels = (song.channels ?? []).slice(0, 3);
  const defaultInstruments = [0, 1, 2].map((i) => channels[i]?.defaultInstrument);
  const { positions, patterns, tracks } = buildOrders(
    aligned,
    indexByName,
    defaultInstruments,
  );

  const title = song.metadata?.name?.trim() || 'Untitled';
  const author = song.metadata?.artist?.trim() || '';
  const commentParts = [
    song.metadata?.description?.trim(),
    song.metadata?.tags?.length ? `tags: ${song.metadata.tags.join(', ')}` : '',
    'Exported from BeatBax (Arkos exporter v1)',
  ].filter(Boolean);

  return {
    formatVersion: '3.0',
    title,
    author,
    composer: author,
    comment: escapeComment(commentParts.join(' | ')),
    instruments,
    subsongs: [
      {
        title: 'Main',
        initialSpeed: deriveInitialSpeed(song.bpm),
        endPosition: Math.max(0, positions.length - 1),
        loopStartPosition: 0,
        replayFrequencyHz: AY_TICK_RATE_HZ,
        // AT3 default digi channel is 1-based channel index 1.
        digiChannel: 1,
        highlightSpacing: 4,
        secondaryHighlight: 4,
        psgs: [
          {
            type: 'ay',
            frequencyHz: resolveAyClockHz(song),
            referenceFrequencyHz: 440,
            samplePlayerFrequencyHz: 8000,
            mixingOutput: 'ABC',
          },
        ],
        positions,
        patterns,
        tracks,
        // Empty containers match official AT3 songs.
        speedTracks: [],
        eventTracks: [],
      },
    ],
  };
}
