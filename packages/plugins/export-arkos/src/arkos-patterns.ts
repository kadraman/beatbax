import { noteToArkos, patternTickLength } from './arkos-notes.js';
import type { ArkosCell, ArkosTrack, ChannelEventLike, SongLike } from './arkos-types.js';

/** Group a channel's flat event stream into frames (one per pattern occurrence). */
export function groupEventsIntoFrames(
  events: ChannelEventLike[],
  pats: Record<string, string[]>,
  defaultChunkSize = 16,
): ChannelEventLike[][] {
  if (events.length === 0) return [];

  const frames: ChannelEventLike[][] = [];
  let i = 0;

  while (i < events.length) {
    const ev = events[i];
    const patName = ev.sourcePattern;

    if (!patName || !pats[patName]) {
      const size = Math.min(defaultChunkSize, events.length - i);
      frames.push(events.slice(i, i + size));
      i += size;
      continue;
    }

    const tickLen = patternTickLength(pats[patName]);
    if (tickLen <= 0) {
      frames.push([events[i]]);
      i++;
      continue;
    }

    const end = Math.min(i + tickLen, events.length);
    frames.push(events.slice(i, end));
    i = end;
  }

  return frames;
}

function buildCell(
  event: ChannelEventLike,
  rowIndex: number,
  instrumentIndex: number | undefined,
): ArkosCell | null {
  if (event.type === 'sustain') {
    // Sparse tracks: omit sustain rows (previous note continues).
    return null;
  }

  if (event.type === 'rest') {
    return {
      index: rowIndex,
      note: 255,
      effects: [{ index: 0, name: 'reset', logicalValue: 0 }],
    };
  }

  if (event.type === 'note' || event.type === 'named') {
    // Named events store the instrument name in `token` (e.g. "kick");
    // the playable pitch is `defaultNote` from the instrument definition.
    const token =
      event.type === 'named'
        ? event.defaultNote || event.token
        : event.token || event.defaultNote;
    if (!token) {
      return {
        index: rowIndex,
        note: 255,
        effects: [{ index: 0, name: 'reset', logicalValue: 0 }],
      };
    }
    const note = noteToArkos(token);
    if (note === null) {
      return {
        index: rowIndex,
        note: 255,
        effects: [{ index: 0, name: 'reset', logicalValue: 0 }],
      };
    }
    const cell: ArkosCell = {
      index: rowIndex,
      note,
      effects: [],
    };
    if (instrumentIndex !== undefined) {
      cell.instrument = instrumentIndex;
    }
    return cell;
  }

  return null;
}

/** Build an Arkos track from a frame of BeatBax events. */
export function buildTrack(
  trackIndex: number,
  events: ChannelEventLike[],
  indexByName: Map<string, number>,
  defaultInstrument?: string,
): ArkosTrack {
  const cells: ArkosCell[] = [];
  for (let row = 0; row < events.length; row++) {
    const ev = events[row];
    const instName = ev.instrument || defaultInstrument;
    const instIndex = instName ? indexByName.get(instName) : undefined;
    const cell = buildCell(ev, row, instIndex);
    if (cell) cells.push(cell);
  }
  return { index: trackIndex, cells };
}

/**
 * Align channel frame counts and pad shorter frames so each position has a
 * consistent height across channels.
 */
export function alignChannelFrames(
  song: SongLike,
): Array<Array<ChannelEventLike[]>> {
  const channels = (song.channels ?? []).slice(0, 3);
  while (channels.length < 3) {
    channels.push({ id: channels.length + 1, events: [] });
  }

  const perChannel = channels.map((ch) =>
    groupEventsIntoFrames(ch.events ?? [], song.pats ?? {}),
  );

  const frameCount = Math.max(1, ...perChannel.map((frames) => frames.length));
  for (const frames of perChannel) {
    while (frames.length < frameCount) {
      frames.push([]);
    }
  }

  // Pad each position's frames to the max height in that position.
  for (let pos = 0; pos < frameCount; pos++) {
    const height = Math.max(
      1,
      ...perChannel.map((frames) => frames[pos]?.length ?? 0),
    );
    for (const frames of perChannel) {
      const frame = frames[pos] ?? [];
      while (frame.length < height) {
        frame.push({ type: 'rest' });
      }
      frames[pos] = frame;
    }
  }

  return perChannel;
}
