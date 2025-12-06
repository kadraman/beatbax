import { midiToFreq, noteNameToMidi, parseWaveTable, parseEnvelope } from '../src/audio/playback';

describe('playback helpers', () => {
  test('midiToFreq: A4 = 440Hz', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
  });

  test('midiToFreq: octave up doubles frequency', () => {
    expect(midiToFreq(81)).toBeCloseTo(880, 6); // 69 + 12 = 81 -> 880Hz
  });

  test('noteNameToMidi: C4 -> 60', () => {
    expect(noteNameToMidi('C', 4)).toBe(60);
  });

  test('noteNameToMidi: A4 -> 69', () => {
    expect(noteNameToMidi('A', 4)).toBe(69);
  });

  test('parseWaveTable: parses array and normalizes', () => {
    const tbl = parseWaveTable([0,3,6,9,12,9,6,3]);
    expect(Array.isArray(tbl)).toBe(true);
    expect(tbl.length).toBe(8);
    expect(tbl[0]).toBe(0);
    expect(tbl[4]).toBe(12);
  });

  test('parseEnvelope: interprets numeric env and down flag', () => {
    const e = parseEnvelope('12,down');
    expect(typeof e.decay).toBe('number');
    expect(e.sustainLevel).toBe(0);
  });
});
