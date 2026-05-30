import {
  formatScaleLockViolationMessage,
  type ExpandedScaleNote,
} from '../src/parser/scale-lock-provenance';

describe('formatScaleLockViolationMessage', () => {
  test('describes modifier chain when pitch changes', () => {
    const note: ExpandedScaleNote = {
      heardNote: 'D#5',
      prov: {
        patternName: 'melody_a',
        sourceNote: 'D5',
        modifiers: ['transpose(+1)'],
        seqPath: ['melody_seq'],
      },
    };
    const msg = formatScaleLockViolationMessage(note, 'scale', 1, 'D dorian', 'D, E, F, G, A, B, C');
    expect(msg).toContain("Note D5 in pat 'melody_a'");
    expect(msg).toContain('via seq melody_seq');
    expect(msg).toContain('becomes D#5 after transpose(+1)');
  });

  test('describes direct pattern violation without modifiers', () => {
    const note: ExpandedScaleNote = {
      heardNote: 'F#4',
      prov: {
        patternName: 'melody',
        sourceNote: 'F#4',
        modifiers: [],
        seqPath: [],
      },
    };
    const msg = formatScaleLockViolationMessage(note, 'scale', 1, 'C major', 'C, D, E, F, G, A, B');
    expect(msg).toContain("Note F#4 in pat 'melody'");
    expect(msg).not.toContain('becomes');
  });

  test('notes how often a violation repeats in channel playback', () => {
    const note: ExpandedScaleNote = {
      heardNote: 'E3',
      prov: {
        patternName: 'bassline',
        sourceNote: 'E3',
        modifiers: [],
        seqPath: ['bass_seq'],
      },
    };
    const msg = formatScaleLockViolationMessage(note, 'root+fifth', 2, 'D major', 'D, A', 4);
    expect(msg).toContain('occurs 4 times in channel 2 playback');
  });
});
