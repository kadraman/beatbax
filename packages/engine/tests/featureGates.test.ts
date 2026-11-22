import { compareSc001, type NoteWindow } from '../src/audio/featureGates.js';

function tone(freq: number, seconds: number, sr: number, amp = 0.2): Float32Array {
  const n = Math.floor(seconds * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return out;
}

const note: NoteWindow = {
  label: 'C4',
  startSec: 0,
  endSec: 0.4,
  modulated: false,
  pitched: true,
};

describe('SC-001 feature gates', () => {
  const sr = 44100;

  test('a render matches itself', () => {
    const a = tone(261.6, 0.5, sr);
    const report = compareSc001(a, a, sr, [note], 0.5, true);
    expect(report.pass).toBe(true);
    expect(report.failures).toEqual([]);
  });

  test('a 1 dB level change fails the note-level gate', () => {
    const a = tone(261.6, 0.5, sr, 0.2);
    const b = tone(261.6, 0.5, sr, 0.2 * Math.pow(10, 1 / 20));
    const report = compareSc001(a, b, sr, [note], 0.5, false);
    expect(report.pass).toBe(false);
    expect(report.failures.some((f) => f.includes('level'))).toBe(true);
  });

  test('a 20 cent pitch change fails the plain-pitch gate', () => {
    const a = tone(261.6, 0.5, sr);
    const b = tone(261.6 * Math.pow(2, 20 / 1200), 0.5, sr);
    const report = compareSc001(a, b, sr, [note], 0.5, false);
    expect(report.pass).toBe(false);
    expect(report.failures.some((f) => f.includes('pitch'))).toBe(true);
  });

  test('a 25% pulse keeps its pitch across a phase shift', () => {
    const n = Math.floor(0.5 * sr);
    const make = (phase: number) => {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const p = ((i / sr) * 261.6 + phase) % 1;
        out[i] = p < 0.25 ? 0.2 : -0.2;
      }
      return out;
    };
    const report = compareSc001(make(0), make(0.37), sr, [note], 0.5, false);
    expect(report.failures).toEqual([]);
  });

  test('noise notes do not require a pitch track', () => {
    const n = Math.floor(0.5 * sr);
    const a = new Float32Array(n);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = ((i * 17) % 9) / 20 - 0.2;
      b[i] = a[i];
    }
    const report = compareSc001(a, b, sr, [{ ...note, pitched: false, label: 'hat' }], 0.5, false);
    expect(report.pass).toBe(true);
  });
});
