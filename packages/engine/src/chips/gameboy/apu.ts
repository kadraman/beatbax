/** Utilities for note/frequency conversions used by the Player. */
export function midiToFreq(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteNameToMidi(name: string, octave: number): number | null {
  const m = name.match(/^([A-G])([#B]?)$/i);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = (m[2] || '').toUpperCase();
  const map: Record<string, number> = { C:0, 'C#':1, DB:1, D:2, 'D#':3, EB:3, E:4, F:5, 'F#':6, GB:6, G:7, 'G#':8, AB:8, A:9, 'A#':10, BB:10, B:11 };
  const key = letter + (acc === 'B' ? 'B' : (acc === '#' ? '#' : ''));
  const semi = map[key as keyof typeof map];
  if (semi === undefined) return null;
  return (octave + 1) * 12 + semi;
}

export default { midiToFreq, noteNameToMidi };
