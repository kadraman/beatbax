import { expandPattern, transposePattern, noteToMidi, midiToNote } from '../src/patterns/expand';

describe('patterns.expand', () => {
  test('expands simple sequence', () => {
    const toks = expandPattern('C4 E4 G4');
    expect(toks).toEqual(['C4', 'E4', 'G4']);
  });

  test('element repeat with *N', () => {
    const toks = expandPattern('C4*3 D4');
    expect(toks).toEqual(['C4', 'C4', 'C4', 'D4']);
  });

  test('group repeat with (...) *N', () => {
    const toks = expandPattern('(C4 E4 G4)*2');
    expect(toks).toEqual(['C4', 'E4', 'G4', 'C4', 'E4', 'G4']);
  });

  test('nested group repeat', () => {
    const toks = expandPattern('(C4 (E4 G4)*2)*2');
    // inner repeats -> C4 E4 G4 E4 G4 ; outer repeats twice
    expect(toks).toEqual(['C4', 'E4', 'G4', 'E4', 'G4', 'C4', 'E4', 'G4', 'E4', 'G4']);
  });

  test('rest preserved and unaffected by transpose', () => {
    const toks = expandPattern('C4 . G4');
    expect(toks).toEqual(['C4', '.', 'G4']);
    const trans = transposePattern(toks, { octaves: -1 });
    expect(trans).toEqual(['C3', '.', 'G3']);
  });

  test('transpose semitones and octaves', () => {
    const toks = ['C4', 'E4'];
    expect(transposePattern(toks, { semitones: 2 })).toEqual(['D4', 'F#4']);
    expect(transposePattern(toks, { octaves: -1 })).toEqual(['C3', 'E3']);
  });

  test('noteToMidi and midiToNote roundtrip', () => {
    const midi = noteToMidi('C4');
    expect(midi).toBe(60);
    expect(midiToNote(60)).toBe('C4');
    expect(noteToMidi('A4')).toBe(69);
  });
});
