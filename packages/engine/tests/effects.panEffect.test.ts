import { get as getEffect } from '../src/effects/index';

describe('pan effect handler', () => {
  test('sets initial pan value when single param provided', () => {
    const panner: any = { pan: { setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() }, connect: jest.fn() };
    const fakeCtx: any = {
      currentTime: 0,
      destination: {},
      createStereoPanner: jest.fn(() => panner),
    };
    const fakeGain: any = { connect: jest.fn(), disconnect: jest.fn() };
    const nodes = [{}, fakeGain];
    const handler = getEffect('pan');
    expect(typeof handler).toBe('function');
    handler!(fakeCtx, nodes, [-0.5], 0, 1);
    // stereo panner should have been created and pan.setValueAtTime called
    const created = (fakeCtx.createStereoPanner as jest.Mock).mock.results[0].value;
    expect(created.pan.setValueAtTime).toHaveBeenCalledWith(-0.5, 0);
  });

  test('ramp from value A to B over duration when two params provided', () => {
    const panner: any = { pan: { setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() }, connect: jest.fn() };
    const fakeCtx: any = {
      currentTime: 0,
      destination: {},
      createStereoPanner: () => panner,
    };
    const fakeGain: any = { connect: jest.fn(), disconnect: jest.fn() };
    const nodes = [{}, fakeGain];
    const handler = getEffect('pan');
    handler!(fakeCtx, nodes, [-1, 1], 0.1, 0.5);
    expect(panner.pan.setValueAtTime).toHaveBeenCalledWith(-1, 0.1);
    expect(panner.pan.linearRampToValueAtTime).toHaveBeenCalledWith(1, 0.6);
  });
});