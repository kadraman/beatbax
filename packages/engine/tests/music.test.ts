import {
  noteToMidi,
  midiToNote,
  midiToFreq,
  midiToFreqForNote,
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
} from '../src/util/music.js';

describe('noteToMidi', () => {
  it('C4 = 60', () => expect(noteToMidi('C4')).toBe(60));
  it('A4 = 69', () => expect(noteToMidi('A4')).toBe(69));
  it('F#5 = 78', () => expect(noteToMidi('F#5')).toBe(78));
  it('Bb3 = 58', () => expect(noteToMidi('Bb3')).toBe(58));
  it('DB3 = 49', () => expect(noteToMidi('DB3')).toBe(49));
  it('invalid returns null', () => expect(noteToMidi('invalid')).toBeNull());
  it('negative octave', () => expect(noteToMidi('C-1')).toBe(0));
});

describe('midiToNote', () => {
  it('60 = C4', () => expect(midiToNote(60)).toBe('C4'));
  it('69 = A4', () => expect(midiToNote(69)).toBe('A4'));
  it('78 = F#5', () => expect(midiToNote(78)).toBe('F#5'));
});

describe('midiToFreq', () => {
  it('A4 (69) = 440 Hz', () => expect(midiToFreq(69)).toBeCloseTo(440, 2));
  it('A3 (57) = 220 Hz', () => expect(midiToFreq(57)).toBeCloseTo(220, 2));
  it('C4 (60) ≈ 261.63 Hz', () => expect(midiToFreq(60)).toBeCloseTo(261.63, 1));
});

describe('midiToFreqForNote', () => {
  it('A4 = 440 Hz', () => expect(midiToFreqForNote('A4')).toBeCloseTo(440, 2));
  it('invalid returns null', () => expect(midiToFreqForNote('invalid')).toBeNull());
});

describe('parseMacro', () => {
  it('parses array', () => {
    const m = parseMacro([1, 2, 3]);
    expect(m?.values).toEqual([1, 2, 3]);
    expect(m?.loopPoint).toBe(-1);
  });

  it('parses string with loop', () => {
    const m = parseMacro('[0,8,15|1]');
    expect(m?.values).toEqual([0, 8, 15]);
    expect(m?.loopPoint).toBe(1);
  });

  it('returns null for invalid', () => expect(parseMacro('invalid')).toBeNull());
});

describe('macro state', () => {
  it('advances and stops with no loop', () => {
    const macro = parseMacro([1, 2, 3])!;
    const state = makeMacroState();
    expect(macroValue(macro, state)).toBe(1);
    advanceMacro(macro, state);
    expect(macroValue(macro, state)).toBe(2);
    advanceMacro(macro, state);
    advanceMacro(macro, state);
    expect(state.done).toBe(true);
    expect(macroValue(macro, state)).toBe(3);
  });
});
