import { RegisterArbitrator } from '../src/register-arbitrator.js';
import type { RegisterIntent } from '../src/register-intent.js';

function makeIntent(
  partial: Partial<RegisterIntent> & { channel: 0 | 1 | 2 }
): RegisterIntent {
  return {
    tick: 0,
    source: { channel: partial.channel },
    ...partial,
  };
}

describe('RegisterArbitrator', () => {
  let arb: RegisterArbitrator;
  const emptyRegs = new Uint8Array(16);

  beforeEach(() => {
    arb = new RegisterArbitrator();
    arb.clearDiagnostics();
  });

  test('empty intents produce carry-over frame', () => {
    const prev = new Uint8Array(16);
    prev[0] = 42;
    const frame = arb.arbitrate(0, [], prev);
    expect(frame.regs[0]).toBe(42);
  });

  test('tone period written to correct channel registers', () => {
    const intent = makeIntent({ channel: 0, tick: 0, tonePeriod: 300 });
    const frame = arb.arbitrate(0, [intent], emptyRegs);
    expect(frame.regs[0]).toBe(300 & 0xff);
    expect(frame.regs[1]).toBe((300 >> 8) & 0x0f);
  });

  test('channel B tone period goes to R2/R3', () => {
    const intent = makeIntent({ channel: 1, tick: 0, tonePeriod: 500 });
    const frame = arb.arbitrate(0, [intent], emptyRegs);
    expect(frame.regs[2]).toBe(500 & 0xff);
    expect(frame.regs[3]).toBe((500 >> 8) & 0x0f);
  });

  test('channel C tone period goes to R4/R5', () => {
    const intent = makeIntent({ channel: 2, tick: 0, tonePeriod: 800 });
    const frame = arb.arbitrate(0, [intent], emptyRegs);
    expect(frame.regs[4]).toBe(800 & 0xff);
    expect(frame.regs[5]).toBe((800 >> 8) & 0x0f);
  });

  test('attenuation written to R8/R9/R10', () => {
    const intents = [
      makeIntent({ channel: 0, tick: 0, attenuation: 10 }),
      makeIntent({ channel: 1, tick: 0, attenuation: 8 }),
      makeIntent({ channel: 2, tick: 0, attenuation: 5 }),
    ];
    const frame = arb.arbitrate(0, intents, emptyRegs);
    expect(frame.regs[8]).toBe(10);
    expect(frame.regs[9]).toBe(8);
    expect(frame.regs[10]).toBe(5);
  });

  test('envelope mode sets bit 4 in amplitude register', () => {
    const intent = makeIntent({ channel: 0, tick: 0, useEnvelope: true });
    const frame = arb.arbitrate(0, [intent], emptyRegs);
    expect(frame.regs[8] & 0x10).toBe(0x10);
  });

  test('R7 mixer: toneEnable clears bit, toneDisable sets bit', () => {
    const prev = new Uint8Array(16);
    prev[7] = 0b111111; // all disabled
    const intent = makeIntent({ channel: 0, tick: 0, toneEnable: true });
    const frame = arb.arbitrate(0, [intent], prev);
    expect(frame.regs[7] & 0x01).toBe(0); // bit 0 cleared = tone A enabled
  });

  test('R7 mixer: per-channel noise enable bit', () => {
    const prev = new Uint8Array(16);
    prev[7] = 0b111111; // all disabled
    const intent = makeIntent({ channel: 1, tick: 0, noiseEnable: true });
    const frame = arb.arbitrate(0, [intent], prev);
    expect(frame.regs[7] & 0b010000).toBe(0); // bit 4 cleared = noise B enabled
  });

  test('R6 noise period: last-writer-wins, no conflict when same', () => {
    const intents = [
      makeIntent({ channel: 0, tick: 0, noisePeriod: 10 }),
      makeIntent({ channel: 1, tick: 0, noisePeriod: 10 }),
    ];
    const frame = arb.arbitrate(0, intents, emptyRegs);
    expect(frame.regs[6]).toBe(10);
    expect(arb.getDiagnostics()).toHaveLength(0);
  });

  test('R6 noise period: conflict emits diagnostic', () => {
    const intents = [
      makeIntent({ channel: 0, tick: 0, noisePeriod: 5 }),
      makeIntent({ channel: 1, tick: 0, noisePeriod: 20 }),
    ];
    const frame = arb.arbitrate(0, intents, emptyRegs);
    // Last writer wins (channel 1)
    expect(frame.regs[6]).toBe(20);
    expect(arb.getDiagnostics()).toHaveLength(1);
    expect(arb.getDiagnostics()[0].register).toBe('R6 (noise period)');
  });

  test('R11–R12 envelope period: last-writer-wins', () => {
    const intents = [
      makeIntent({ channel: 0, tick: 0, envelopePeriod: 1000 }),
      makeIntent({ channel: 1, tick: 0, envelopePeriod: 2000 }),
    ];
    const frame = arb.arbitrate(0, intents, emptyRegs);
    expect(frame.regs[11]).toBe(2000 & 0xff);
    expect(frame.regs[12]).toBe((2000 >> 8) & 0xff);
  });

  test('R13 envelope shape conflict emits diagnostic', () => {
    const intents = [
      makeIntent({ channel: 0, tick: 0, envelopeShape: 8 }),
      makeIntent({ channel: 1, tick: 0, envelopeShape: 12 }),
    ];
    arb.arbitrate(0, intents, emptyRegs);
    expect(arb.getDiagnostics()).toHaveLength(1);
    expect(arb.getDiagnostics()[0].register).toBe('R13 (envelope shape)');
  });

  test('clearDiagnostics resets list', () => {
    const intents = [
      makeIntent({ channel: 0, tick: 0, noisePeriod: 5 }),
      makeIntent({ channel: 1, tick: 0, noisePeriod: 20 }),
    ];
    arb.arbitrate(0, intents, emptyRegs);
    expect(arb.getDiagnostics().length).toBeGreaterThan(0);
    arb.clearDiagnostics();
    expect(arb.getDiagnostics()).toHaveLength(0);
  });

  test('tick is preserved in returned frame', () => {
    const frame = arb.arbitrate(42, [], emptyRegs);
    expect(frame.tick).toBe(42);
  });
});
