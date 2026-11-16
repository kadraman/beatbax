import {
  attachBipolarPulseDc,
  bipolarPulseDcOffset,
  setBipolarPulseDcOffset,
} from '../src/chips/pulseDc.js';

describe('bipolarPulseDcOffset', () => {
  test('matches mean of a ±1 pulse for common duties', () => {
    expect(bipolarPulseDcOffset(0.5)).toBeCloseTo(0, 10);
    expect(bipolarPulseDcOffset(0.25)).toBeCloseTo(-0.5, 10);
    expect(bipolarPulseDcOffset(0.125)).toBeCloseTo(-0.75, 10);
    expect(bipolarPulseDcOffset(0.75)).toBeCloseTo(0.5, 10);
  });

  test('clamps and tolerates bad input', () => {
    expect(bipolarPulseDcOffset(-1)).toBe(-1);
    expect(bipolarPulseDcOffset(2)).toBe(1);
    expect(bipolarPulseDcOffset(Number.NaN)).toBe(0);
  });
});

describe('attachBipolarPulseDc', () => {
  function makeCtx() {
    const dc = {
      offset: { setValueAtTime: jest.fn(), value: 0 },
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    };
    const ctx: any = {
      createConstantSource: jest.fn(() => dc),
    };
    const gain = {} as AudioNode;
    return { ctx, gain, dc };
  }

  test('wires ConstantSource into the gain with 2d-1 offset (#271)', () => {
    const { ctx, gain, dc } = makeCtx();
    const out = attachBipolarPulseDc(ctx, gain, 0.25, 1.5, 2.5);
    expect(out).toBe(dc);
    expect(ctx.createConstantSource).toHaveBeenCalled();
    expect(dc.offset.setValueAtTime).toHaveBeenCalledWith(-0.5, 1.5);
    expect(dc.connect).toHaveBeenCalledWith(gain);
    expect(dc.start).toHaveBeenCalledWith(1.5);
    expect(dc.stop).toHaveBeenCalledWith(2.5);
  });

  test('returns null when ConstantSourceNode is unavailable', () => {
    const ctx = {} as BaseAudioContext;
    expect(attachBipolarPulseDc(ctx, {} as AudioNode, 0.5, 0, 1)).toBeNull();
  });

  test('setBipolarPulseDcOffset updates an existing source', () => {
    const dc = { offset: { setValueAtTime: jest.fn() } };
    setBipolarPulseDcOffset(dc, 0.125, 3);
    expect(dc.offset.setValueAtTime).toHaveBeenCalledWith(-0.75, 3);
  });
});
