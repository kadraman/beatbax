/**
 * General MIDI program names (GM Level 1, programs 0–127).
 * Used by editor hovers and completion hints for `gm=` on instrument lines.
 */

import type * as monaco from 'monaco-editor';

/** Standard GM Level 1 patch names. Index = program number. */
export const GM_PROGRAM_NAMES: readonly string[] = [
  'Acoustic Grand Piano',
  'Bright Acoustic Piano',
  'Electric Grand Piano',
  'Honky-tonk Piano',
  'Electric Piano 1',
  'Electric Piano 2',
  'Harpsichord',
  'Clavinet',
  'Celesta',
  'Glockenspiel',
  'Music Box',
  'Vibraphone',
  'Marimba',
  'Xylophone',
  'Tubular Bells',
  'Dulcimer',
  'Drawbar Organ',
  'Percussive Organ',
  'Rock Organ',
  'Church Organ',
  'Reed Organ',
  'Accordion',
  'Harmonica',
  'Tango Accordion',
  'Acoustic Guitar (nylon)',
  'Acoustic Guitar (steel)',
  'Electric Guitar (jazz)',
  'Electric Guitar (clean)',
  'Electric Guitar (muted)',
  'Overdriven Guitar',
  'Distortion Guitar',
  'Guitar Harmonics',
  'Acoustic Bass',
  'Electric Bass (finger)',
  'Electric Bass (pick)',
  'Fretless Bass',
  'Slap Bass 1',
  'Slap Bass 2',
  'Synth Bass 1',
  'Synth Bass 2',
  'Violin',
  'Viola',
  'Cello',
  'Contrabass',
  'Tremolo Strings',
  'Pizzicato Strings',
  'Orchestral Harp',
  'Timpani',
  'String Ensemble 1',
  'String Ensemble 2',
  'Synth Strings 1',
  'Synth Strings 2',
  'Choir Aahs',
  'Voice Oohs',
  'Synth Voice',
  'Orchestra Hit',
  'Trumpet',
  'Trombone',
  'Tuba',
  'Muted Trumpet',
  'French Horn',
  'Brass Section',
  'Synth Brass 1',
  'Synth Brass 2',
  'Soprano Sax',
  'Alto Sax',
  'Tenor Sax',
  'Baritone Sax',
  'Oboe',
  'English Horn',
  'Bassoon',
  'Clarinet',
  'Piccolo',
  'Flute',
  'Recorder',
  'Pan Flute',
  'Blown Bottle',
  'Shakuhachi',
  'Whistle',
  'Ocarina',
  'Lead 1 (square)',
  'Lead 2 (sawtooth)',
  'Lead 3 (calliope)',
  'Lead 4 (chime)',
  'Lead 5 (charang)',
  'Lead 6 (voice)',
  'Lead 7 (fifths)',
  'Lead 8 (bass + lead)',
  'Pad 1 (new age)',
  'Pad 2 (warm)',
  'Pad 3 (polysynth)',
  'Pad 4 (choir)',
  'Pad 5 (bowed)',
  'Pad 6 (metallic)',
  'Pad 7 (halo)',
  'Pad 8 (sweep)',
  'FX 1 (rain)',
  'FX 2 (soundtrack)',
  'FX 3 (crystal)',
  'FX 4 (atmosphere)',
  'FX 5 (brightness)',
  'FX 6 (goblins)',
  'FX 7 (echoes)',
  'FX 8 (sci-fi)',
  'Sitar',
  'Banjo',
  'Shamisen',
  'Koto',
  'Kalimba',
  'Bag pipe',
  'Fiddle',
  'Shanai',
  'Tinkle Bell',
  'Agogo',
  'Steel Drums',
  'Woodblock',
  'Taiko Drum',
  'Melodic Tom',
  'Synth Drum',
  'Reverse Cymbal',
  'Guitar Fret Noise',
  'Breath Noise',
  'Seashore',
  'Bird Tweet',
  'Telephone Ring',
  'Helicopter',
  'Applause',
  'Gunshot',
];

const GM_FAMILY_RANGES: ReadonlyArray<{ max: number; label: string }> = [
  { max: 7, label: 'Piano' },
  { max: 15, label: 'Chromatic Percussion' },
  { max: 23, label: 'Organ' },
  { max: 31, label: 'Guitar' },
  { max: 39, label: 'Bass' },
  { max: 47, label: 'Strings' },
  { max: 55, label: 'Ensemble' },
  { max: 63, label: 'Brass' },
  { max: 71, label: 'Reed' },
  { max: 79, label: 'Pipe' },
  { max: 87, label: 'Synth Lead' },
  { max: 95, label: 'Synth Pad' },
  { max: 103, label: 'Synth Effects' },
  { max: 111, label: 'Ethnic' },
  { max: 119, label: 'Percussive' },
  { max: 127, label: 'Sound Effects' },
];

export function getGmProgramName(program: number): string | null {
  if (!Number.isInteger(program) || program < 0 || program > 127) return null;
  return GM_PROGRAM_NAMES[program] ?? null;
}

export function getGmProgramFamily(program: number): string | null {
  if (!Number.isInteger(program) || program < 0 || program > 127) return null;
  return GM_FAMILY_RANGES.find((entry) => program <= entry.max)?.label ?? null;
}

export interface ParsedGmProgram {
  program: number;
  range: monaco.IRange;
}

/** Parse `gm=<0-127>` when the cursor is on an instrument definition line. */
export function parseGmAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
): ParsedGmProgram | null {
  const line = model.getLineContent(position.lineNumber);
  if (!/^\s*inst\s+/.test(line)) return null;

  const col0 = position.column - 1;
  const re = /\bgm\s*=\s*(\d+)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    const tokenStart = match.index;
    const tokenEnd = match.index + match[0].length;
    if (col0 < tokenStart || col0 >= tokenEnd) continue;

    const program = Number.parseInt(match[1], 10);
    if (Number.isNaN(program)) continue;

    return {
      program,
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

export function buildGmHoverMarkdown(program: number): string {
  const name = getGmProgramName(program);
  const family = getGmProgramFamily(program);

  const lines = [
    '**General MIDI program** — sets the Program Change sent on MIDI export.',
    '',
  ];

  if (name) {
    lines.push(`Program **${program}**: ${name}`);
    if (family) lines.push(`Family: **${family}**`);
  } else {
    lines.push(`Program **${program}** is out of range — use **0–127**.`);
  }

  lines.push(
    '',
    'If `gm=` is omitted, the exporter picks a default based on instrument type (e.g. pulse1 → Lead 1).',
    '',
    'Example: `inst lead type=pulse1 duty=50 gm=81`',
  );

  return lines.join('\n');
}
