import { serializeDefaultExpressions } from './arkos-expressions.js';
import type { ArkosInstrument, ArkosSong } from './arkos-types.js';
import { line, tag } from './xml.js';

const NS = 'https://www.julien-nevo.com/arkostracker/ArkosTrackerSong';

/**
 * Serialize an Arkos instrument bank as `.aki`.
 *
 * v1 emits a song-shaped document containing only the instrument table so the
 * file can be opened / inspected with the same XML schema as `.aks`. Individual
 * instrument import into Arkos Tracker may still prefer one instrument per file
 * in a later revision.
 */
export function serializeAki(song: ArkosSong): string {
  return serializeAkiInstruments(song.instruments);
}

export function serializeAkiInstruments(instruments: ArkosInstrument[]): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<song xmlns:aks="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="https://www.julien-nevo.com/arkostracker/schema/at3">`,
  );
  lines.push(line(1, tag('formatVersion', '3.0')));
  lines.push(line(1, tag('title', 'BeatBax Instrument Bank')));
  lines.push(line(1, tag('author', 'Unknown')));
  lines.push(line(1, tag('composer', 'Unknown')));
  lines.push(line(1, tag('comment', 'Exported from BeatBax (Arkos exporter v1 instrument bank)')));
  lines.push(line(1, tag('creationDateMs', 0)));
  lines.push(line(1, tag('modificationDateMs', 0)));
  lines.push(line(1, '<instruments>'));

  for (const inst of instruments) {
    lines.push(line(2, '<instrument>'));
    lines.push(line(3, tag('name', inst.name)));
    lines.push(line(3, tag('colorArgb', inst.colorArgb)));
    lines.push(line(3, tag('type', 'psg')));
    lines.push(line(3, tag('speed', inst.speed)));
    lines.push(line(3, tag('isRetrig', inst.isRetrig)));
    lines.push(line(3, tag('loopStartIndex', inst.loopStartIndex)));
    lines.push(line(3, tag('endIndex', inst.endIndex)));
    lines.push(line(3, tag('isLooping', inst.isLooping)));
    lines.push(line(3, tag('isSfxExported', inst.isSfxExported)));
    lines.push(line(3, '<cells>'));
    for (const cell of inst.cells) {
      lines.push(line(4, '<cell>'));
      lines.push(line(5, tag('volume', cell.volume)));
      lines.push(line(5, tag('noise', cell.noise)));
      lines.push(line(5, tag('link', cell.link)));
      lines.push(line(5, tag('primaryPeriod', cell.primaryPeriod ?? 0)));
      lines.push(
        line(
          5,
          tag('primaryArpeggioNoteInOctave', cell.primaryArpeggioNoteInOctave ?? 0),
        ),
      );
      lines.push(
        line(5, tag('primaryArpeggioOctave', cell.primaryArpeggioOctave ?? 0)),
      );
      lines.push(line(5, tag('primaryPitch', cell.primaryPitch ?? 0)));
      lines.push(line(5, tag('ratio', cell.ratio ?? 4)));
      lines.push(line(5, tag('hardwareEnvelope', cell.hardwareEnvelope ?? 8)));
      lines.push(line(5, tag('secondaryPeriod', 0)));
      lines.push(line(5, tag('secondaryArpeggioNoteInOctave', 0)));
      lines.push(line(5, tag('secondaryArpeggioOctave', 0)));
      lines.push(line(5, tag('secondaryPitch', 0)));
      lines.push(line(5, tag('isRetrig', cell.isRetrig ?? false)));
      lines.push(line(4, '</cell>'));
    }
    lines.push(line(3, '</cells>'));
    lines.push(line(2, '</instrument>'));
  }

  lines.push(line(1, '</instruments>'));
  lines.push(...serializeDefaultExpressions(1));
  lines.push(line(1, '<subsongs/>'));
  lines.push('</song>');
  lines.push('');
  return lines.join('\n');
}
