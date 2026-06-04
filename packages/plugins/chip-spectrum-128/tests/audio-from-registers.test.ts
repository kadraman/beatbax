import { renderFromRegisterLog } from '../src/audio-from-registers.js';
import type { RegisterLogEntry } from '../src/register-log.js';

function makeNoiseEntry(tick: number): RegisterLogEntry {
  const regs = new Uint8Array(16);
  regs[6] = 4;
  regs[7] = 0b110111;
  regs[8] = 12;
  return { tick, regs };
}

describe('renderFromRegisterLog', () => {
  test('noise rendering is deterministic across runs', () => {
    const entries = [makeNoiseEntry(0), makeNoiseEntry(1), makeNoiseEntry(2)];
    const first = renderFromRegisterLog(entries, 44100, 1_773_400);
    const second = renderFromRegisterLog(entries, 44100, 1_773_400);
    expect(first.length).toBeGreaterThan(0);
    expect(Array.from(first)).toEqual(Array.from(second));
  });

  test('noise output is non-silent for a noise-only channel', () => {
    const entries = [makeNoiseEntry(0)];
    const pcm = renderFromRegisterLog(entries, 44100, 1_773_400);
    let energy = 0;
    for (let i = 0; i < pcm.length; i++) energy += Math.abs(pcm[i]);
    expect(energy).toBeGreaterThan(0);
  });
});
