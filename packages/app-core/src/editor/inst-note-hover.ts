/**
 * Hover helpers for `note=` on instrument definition lines.
 * Explains default hit pitch for named percussion tokens (kick, snare, …).
 */

import type * as monaco from 'monaco-editor';

const NOTE_SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3,
  E: 4, F: 5, 'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8,
  A: 9, 'A#': 10, BB: 10, B: 11,
};

function noteToMidi(note: string): number | null {
  const m = note.match(/^([A-G])([#bB]?)(-?\d+)$/i);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2] ? (m[2].toLowerCase() === 'b' ? 'B' : '#') : '';
  const octave = parseInt(m[3], 10);
  const key = letter + acc;
  const semi = NOTE_SEMITONES[key];
  if (semi === undefined) return null;
  return (octave + 1) * 12 + semi;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** GM Level 1 drum map (channel 10), MIDI notes 35–81. */
const GM_DRUM_NAMES: Record<number, string> = {
  35: 'Acoustic Bass Drum',
  36: 'Bass Drum 1',
  37: 'Side Stick',
  38: 'Acoustic Snare',
  39: 'Hand Clap',
  40: 'Electric Snare',
  41: 'Low Floor Tom',
  42: 'Closed Hi-Hat',
  43: 'High Floor Tom',
  44: 'Pedal Hi-Hat',
  45: 'Low Tom',
  46: 'Open Hi-Hat',
  47: 'Low-Mid Tom',
  48: 'Hi-Mid Tom',
  49: 'Crash Cymbal 1',
  50: 'High Tom',
  51: 'Ride Cymbal 1',
  52: 'Chinese Cymbal',
  53: 'Ride Bell',
  54: 'Tambourine',
  55: 'Splash Cymbal',
  56: 'Cowbell',
  57: 'Crash Cymbal 2',
  58: 'Vibraslap',
  59: 'Ride Cymbal 2',
  60: 'Hi Bongo',
  61: 'Low Bongo',
  62: 'Mute Hi Conga',
  63: 'Open Hi Conga',
  64: 'Low Conga',
  65: 'High Timbale',
  66: 'Low Timbale',
  67: 'High Agogo',
  68: 'Low Agogo',
  69: 'Cabasa',
  70: 'Maracas',
  71: 'Short Whistle',
  72: 'Long Whistle',
  73: 'Short Guiro',
  74: 'Long Guiro',
  75: 'Claves',
  76: 'Hi Wood Block',
  77: 'Low Wood Block',
  78: 'Mute Cuica',
  79: 'Open Cuica',
  80: 'Mute Triangle',
  81: 'Open Triangle',
};

export interface ParsedInstNote {
  noteName: string;
  instType?: string;
  instLine: string;
  range: monaco.IRange;
}

const NOTE_ASSIGNMENT_RE = /\bnote\s*=\s*([A-G][#bB]?-?\d+)/gi;

export function parseInstTypeFromLine(line: string): string | undefined {
  const match = /\btype\s*=\s*([a-zA-Z][\w-]*)/.exec(line);
  return match?.[1]?.toLowerCase();
}

export function isPercussionInstrument(instType?: string, line?: string): boolean {
  if (instType?.includes('noise') || instType === 'dmc') return true;
  if (line && /\btone_mix\s*=\s*true\b/i.test(line)) return true;
  return false;
}

/** hUGETracker note index (0 = MIDI 36); clamps/transposes like the UGE exporter. */
export function noteToUgeIndex(midi: number): number | null {
  let ugeIndex = midi - 36;
  while (ugeIndex < 0 && ugeIndex + 12 <= 72) ugeIndex += 12;
  if (ugeIndex < 0 || ugeIndex > 72) return null;
  return ugeIndex;
}

export function getGmDrumName(midi: number): string | null {
  return GM_DRUM_NAMES[midi] ?? null;
}

/** Parse `note=C7` when the cursor is on an instrument definition line. */
export function parseNoteAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
): ParsedInstNote | null {
  const line = model.getLineContent(position.lineNumber);
  if (!/^\s*inst\s+/.test(line)) return null;

  const col0 = position.column - 1;
  const re = new RegExp(NOTE_ASSIGNMENT_RE.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    const tokenStart = match.index;
    const tokenEnd = match.index + match[0].length;
    if (col0 < tokenStart || col0 >= tokenEnd) continue;

    return {
      noteName: match[1],
      instType: parseInstTypeFromLine(line),
      instLine: line,
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: tokenStart + 1,
        endColumn: tokenEnd + 1,
      },
    };
  }

  return null;
}

function formatFrequency(hz: number): string {
  return hz >= 100 ? `${hz.toFixed(1)} Hz` : `${hz.toFixed(2)} Hz`;
}

export function buildNoteHoverMarkdown(
  parsed: ParsedInstNote,
  chip: string = 'gameboy',
): string {
  const { noteName, instType, instLine } = parsed;
  const midi = noteToMidi(noteName);
  const percussion = isPercussionInstrument(instType, instLine);
  const canonicalChip = chip.toLowerCase();

  const lines = [
    '**Default hit note** — pitch used when this instrument name is written as a pattern token.',
    '',
    `Note **${noteName}**`,
  ];

  if (midi === null) {
    lines.push('', 'Could not parse this note name — use scientific pitch notation (e.g. `C4`, `F#5`, `Bb3`).');
    return lines.join('\n');
  }

  const freq = midiToFreq(midi);
  lines.push(`MIDI **${midi}** · ${formatFrequency(freq)}`);

  if (canonicalChip === 'gameboy' || canonicalChip === 'gb' || canonicalChip === 'dmg') {
    const ugeIndex = noteToUgeIndex(midi);
    if (ugeIndex !== null) {
      lines.push(`hUGE export index: **${ugeIndex}**`);
    }
  }

  const drumName = getGmDrumName(midi);
  if (drumName) {
    lines.push(`GM drum map (reference): **${drumName}**`);
  }

  lines.push('');

  if (instType?.includes('noise')) {
    lines.push(
      'On **noise** instruments, `note=` sets the exported pitch column (hUGETracker) and helps tune the noise period.',
      'Playback still uses the instrument definition (`env=`, `width=`, …); combine those with `note=` to sculpt kicks, snares, and hats.',
      '',
      'Example: `inst snare type=noise gb:width=7 env=13,down note=C7`',
    );
  } else if (instType === 'dmc') {
    lines.push(
      'DMC samples are not pitch-driven the same way as tone channels; `note=` is mainly used for MIDI/export metadata.',
    );
  } else if (percussion) {
    lines.push(
      'With **tone + noise mix** (`tone_mix=true`), `note=` sets the stick/click layer pitch on named hits.',
      '',
      'Example: `inst hat type=tone1 tone_mix=true tone_frames=1 note=E7`',
    );
  } else {
    lines.push(
      'On melodic channels, named hits play at this frequency instead of requiring an explicit note in the pattern.',
      '',
      'Example: `inst kick type=pulse1 duty=12.5 env=15,down note=C2` → `pat drums = kick . snare .`',
    );
  }

  return lines.join('\n');
}
