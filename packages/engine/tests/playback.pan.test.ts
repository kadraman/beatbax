import Player from '../src/audio/playback';

describe('playback panning', () => {
  test('tryApplyPan inserts StereoPannerNode when available', () => {
    const fakeCtx: any = {
      currentTime: 0,
      destination: {},
      createStereoPanner: () => ({ pan: { setValueAtTime: jest.fn() }, connect: jest.fn() }),
    };

    const fakeGain: any = { connect: jest.fn(), disconnect: jest.fn() };
    const nodes = [{}, fakeGain];

    const player: any = new (Player as any)(fakeCtx);
    // call private method via `any`
    player.tryApplyPan(fakeCtx, nodes, { enum: 'L' });

    // expect gain.disconnect to have been called (we disconnect from destination)
    expect(fakeGain.disconnect).toHaveBeenCalled();
  });

  test('tryApplyPan accepts numeric pan values', () => {
    const fakeCtx: any = {
      currentTime: 0,
      destination: {},
      createStereoPanner: () => ({ pan: { setValueAtTime: jest.fn() }, connect: jest.fn() }),
    };
    const fakeGain: any = { connect: jest.fn(), disconnect: jest.fn() };
    const nodes = [{}, fakeGain];
    const player: any = new (Player as any)(fakeCtx);
    player.tryApplyPan(fakeCtx, nodes, -0.5);
    expect(fakeGain.disconnect).toHaveBeenCalled();
  });
});