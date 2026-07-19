import { serializeDefaultExpressions } from './arkos-expressions.js';
import type {
  ArkosCell,
  ArkosInstrument,
  ArkosInstrumentCell,
  ArkosPosition,
  ArkosSong,
  ArkosTrack,
} from './arkos-types.js';
import { line, tag } from './xml.js';

const NS = 'https://www.julien-nevo.com/arkostracker/ArkosTrackerSong';
const SCHEMA = 'https://www.julien-nevo.com/arkostracker/schema/at3';

function serializeCell(cell: ArkosInstrumentCell, level: number): string[] {
  const out: string[] = [];
  out.push(line(level, '<cell>'));
  out.push(line(level + 1, tag('volume', cell.volume)));
  out.push(line(level + 1, tag('noise', cell.noise)));
  out.push(line(level + 1, tag('primaryPeriod', cell.primaryPeriod ?? 0)));
  out.push(
    line(
      level + 1,
      tag('primaryArpeggioNoteInOctave', cell.primaryArpeggioNoteInOctave ?? 0),
    ),
  );
  out.push(
    line(level + 1, tag('primaryArpeggioOctave', cell.primaryArpeggioOctave ?? 0)),
  );
  out.push(line(level + 1, tag('primaryPitch', cell.primaryPitch ?? 0)));
  out.push(line(level + 1, tag('link', cell.link)));
  out.push(line(level + 1, tag('ratio', cell.ratio ?? 4)));
  out.push(line(level + 1, tag('hardwareEnvelope', cell.hardwareEnvelope ?? 8)));
  out.push(line(level + 1, tag('secondaryPeriod', 0)));
  out.push(line(level + 1, tag('secondaryArpeggioNoteInOctave', 0)));
  out.push(line(level + 1, tag('secondaryArpeggioOctave', 0)));
  out.push(line(level + 1, tag('secondaryPitch', 0)));
  out.push(line(level + 1, tag('isRetrig', cell.isRetrig ?? false)));
  out.push(line(level, '</cell>'));
  return out;
}

function serializeInstrument(inst: ArkosInstrument, level: number): string[] {
  const out: string[] = [];
  out.push(line(level, '<instrument>'));
  out.push(line(level + 1, tag('name', inst.name)));
  out.push(line(level + 1, tag('colorArgb', inst.colorArgb)));
  out.push(line(level + 1, tag('type', 'psg')));
  out.push(line(level + 1, tag('speed', inst.speed)));
  out.push(line(level + 1, tag('isRetrig', inst.isRetrig)));
  out.push(line(level + 1, tag('loopStartIndex', inst.loopStartIndex)));
  out.push(line(level + 1, tag('endIndex', inst.endIndex)));
  out.push(line(level + 1, tag('isLooping', inst.isLooping)));
  out.push(line(level + 1, tag('isSfxExported', inst.isSfxExported)));
  out.push(line(level + 1, '<cells>'));
  for (const cell of inst.cells) {
    out.push(...serializeCell(cell, level + 2));
  }
  out.push(line(level + 1, '</cells>'));
  out.push(line(level, '</instrument>'));
  return out;
}

function serializeTrackCell(cell: ArkosCell, level: number): string[] {
  const out: string[] = [];
  out.push(line(level, '<cell>'));
  out.push(line(level + 1, tag('index', cell.index)));
  out.push(line(level + 1, tag('note', cell.note)));
  if (cell.instrument !== undefined) {
    out.push(line(level + 1, tag('instrument', cell.instrument)));
  }
  if (cell.effects.length > 0) {
    out.push(line(level + 1, '<effects>'));
    for (const fx of cell.effects) {
      out.push(line(level + 2, '<effect>'));
      out.push(line(level + 3, tag('index', fx.index)));
      out.push(line(level + 3, tag('name', fx.name)));
      out.push(line(level + 3, tag('logicalValue', fx.logicalValue)));
      out.push(line(level + 2, '</effect>'));
    }
    out.push(line(level + 1, '</effects>'));
  }
  out.push(line(level, '</cell>'));
  return out;
}

function serializeTrack(track: ArkosTrack, level: number): string[] {
  const out: string[] = [];
  out.push(line(level, '<track>'));
  out.push(line(level + 1, tag('index', track.index)));
  for (const cell of track.cells) {
    out.push(...serializeTrackCell(cell, level + 1));
  }
  out.push(line(level, '</track>'));
  return out;
}

function serializePosition(pos: ArkosPosition, level: number): string[] {
  const out: string[] = [];
  out.push(line(level, '<position>'));
  out.push(line(level + 1, tag('patternIndex', pos.patternIndex)));
  out.push(line(level + 1, tag('height', pos.height)));
  out.push(line(level + 1, tag('markerName', pos.markerName)));
  out.push(line(level + 1, tag('markerColor', pos.markerColor)));
  // AT3 PositionSerializer expects either empty <transpositions/> or
  // <transposition><channel/><value/></transposition> for non-zero values only.
  if (pos.transpositions.length === 0) {
    out.push(line(level + 1, '<transpositions/>'));
  } else {
    out.push(line(level + 1, '<transpositions>'));
    for (const t of pos.transpositions) {
      if (t.value === 0) continue;
      out.push(line(level + 2, '<transposition>'));
      out.push(line(level + 3, tag('channel', t.channel)));
      out.push(line(level + 3, tag('value', t.value)));
      out.push(line(level + 2, '</transposition>'));
    }
    out.push(line(level + 1, '</transpositions>'));
  }
  out.push(line(level, '</position>'));
  return out;
}

/** Serialize a full Arkos song to AT3 format 3.0 plain XML. */
export function serializeAks(song: ArkosSong): string {
  // Fixed timestamps keep exports byte-identical across runs.
  const dateMs = 0;
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<song xmlns:aks="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${SCHEMA}">`,
  );
  lines.push(line(1, tag('formatVersion', song.formatVersion)));
  lines.push(line(1, tag('title', song.title)));
  lines.push(line(1, tag('author', song.author || 'Unknown')));
  lines.push(line(1, tag('composer', song.composer || 'Unknown')));
  lines.push(line(1, tag('comment', song.comment)));
  lines.push(line(1, tag('creationDateMs', dateMs)));
  lines.push(line(1, tag('modificationDateMs', dateMs)));

  lines.push(line(1, '<instruments>'));
  for (const inst of song.instruments) {
    lines.push(...serializeInstrument(inst, 2));
  }
  lines.push(line(1, '</instruments>'));

  lines.push(...serializeDefaultExpressions(1));

  lines.push(line(1, '<subsongs>'));
  for (const sub of song.subsongs) {
    lines.push(line(2, '<subsong>'));
    lines.push(line(3, tag('title', sub.title)));
    lines.push(line(3, tag('initialSpeed', sub.initialSpeed)));
    lines.push(line(3, tag('digiChannel', sub.digiChannel)));
    lines.push(line(3, tag('highlightSpacing', sub.highlightSpacing)));
    lines.push(line(3, tag('secondaryHighlight', sub.secondaryHighlight)));
    lines.push(line(3, tag('loopStartPosition', sub.loopStartPosition)));
    lines.push(line(3, tag('endPosition', sub.endPosition)));
    lines.push(line(3, tag('replayFrequencyHz', sub.replayFrequencyHz)));

    lines.push(line(3, '<psgs>'));
    for (const psg of sub.psgs) {
      lines.push(line(4, '<psg>'));
      lines.push(line(5, tag('type', psg.type)));
      lines.push(line(5, tag('frequencyHz', psg.frequencyHz)));
      lines.push(line(5, tag('referenceFrequencyHz', psg.referenceFrequencyHz)));
      lines.push(line(5, tag('samplePlayerFrequencyHz', psg.samplePlayerFrequencyHz)));
      lines.push(line(5, tag('mixingOutput', psg.mixingOutput)));
      lines.push(line(4, '</psg>'));
    }
    lines.push(line(3, '</psgs>'));

    // Official AT3 order: tracks → speed/event → positions → patterns
    lines.push(line(3, '<tracks>'));
    const sortedTracks = [...sub.tracks].sort((a, b) => a.index - b.index);
    for (const track of sortedTracks) {
      lines.push(...serializeTrack(track, 4));
    }
    lines.push(line(3, '</tracks>'));

    lines.push(line(3, '<speedTracks/>'));
    lines.push(line(3, '<eventTracks/>'));

    lines.push(line(3, '<positions>'));
    for (const pos of sub.positions) {
      lines.push(...serializePosition(pos, 4));
    }
    lines.push(line(3, '</positions>'));

    lines.push(line(3, '<patterns>'));
    for (const pat of sub.patterns) {
      lines.push(line(4, '<pattern>'));
      for (const trackIndex of pat.trackIndexes) {
        lines.push(line(5, '<trackIndexes>'));
        lines.push(line(6, tag('trackIndex', trackIndex)));
        lines.push(line(5, '</trackIndexes>'));
      }
      lines.push(line(5, '<speedTrackIndex>'));
      lines.push(line(6, tag('trackIndex', pat.speedTrackIndex)));
      lines.push(line(5, '</speedTrackIndex>'));
      lines.push(line(5, '<eventTrackIndex>'));
      lines.push(line(6, tag('trackIndex', pat.eventTrackIndex)));
      lines.push(line(5, '</eventTrackIndex>'));
      lines.push(line(5, tag('colorArgb', pat.colorArgb)));
      lines.push(line(4, '</pattern>'));
    }
    lines.push(line(3, '</patterns>'));

    lines.push(line(2, '</subsong>'));
  }
  lines.push(line(1, '</subsongs>'));
  lines.push('</song>');
  lines.push('');
  return lines.join('\n');
}
