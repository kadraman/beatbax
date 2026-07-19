import { renderFromRegisterLog } from '../src/audio-from-registers.js';
import { amplitudeToGain } from '../src/ay-volume.js';
import type { RegisterLogEntry } from '../src/register-log.js';

function makeNoiseEntry(tick: number): RegisterLogEntry {
  const regs = new Uint8Array(16);
  regs[6] = 4;
  regs[7] = 0b110111;
  regs[8] = 12;
  return { tick, regs };
}

function makeToneEntry(tick: number, amp: number): RegisterLogEntry {
  const regs = new Uint8Array(16);
  // ~C4 on Spectrum clock: period 424
  regs[0] = 424 & 0xff;
  regs[1] = (424 >> 8) & 0x0f;
  regs[7] = 0b111110; // tone A on
  regs[8] = amp & 0x0f;
  return { tick, regs };
}

function peakAbs(pcm: Float32Array): number {
  let p = 0;
  for (let i = 0; i < pcm.length; i++) p = Math.max(p, Math.abs(pcm[i]!));
  return p;
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

  test('fixed amplitude uses DAC peak gain (not linear vol/15)', () => {
    const pcm15 = renderFromRegisterLog([makeToneEntry(0, 15)], 44100, 1_773_400);
    const pcm10 = renderFromRegisterLog([makeToneEntry(0, 10)], 44100, 1_773_400);
    const p15 = peakAbs(pcm15);
    const p10 = peakAbs(pcm10);
    expect(p15).toBeCloseTo(amplitudeToGain(15), 2);
    expect(p10).toBeCloseTo(amplitudeToGain(10), 2);
    // Mid volume is well below linear 10/15 of full scale.
    expect(p10 / p15).toBeLessThan(0.7);
    expect(p10 / p15).toBeCloseTo(amplitudeToGain(10) / amplitudeToGain(15), 2);
  });
});

