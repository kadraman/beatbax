import Player from '../src/audio/playback';

describe('Player.stopChannel', () => {
  test('stops live activeNodes and buffered nodes for a channel', () => {
    // Create a minimal fake AudioContext with createGain and createOscillator/createBufferSource
    const fakeCtx: any = {
      currentTime: 0,
      createGain: () => ({ gain: { setValueAtTime: () => {} }, connect: () => {}, disconnect: () => {} }),
      createOscillator: () => ({ start: jest.fn(), stop: jest.fn(), connect: () => {}, disconnect: jest.fn() }),
      createBufferSource: () => ({ start: jest.fn(), stop: jest.fn(), connect: () => {}, disconnect: jest.fn(), buffer: null }),
      destination: {},
      sampleRate: 44100,
    } as any;

    const player = new (Player as any)(fakeCtx);

    // Simulate activeNodes for channels 1 and 2
    const fakeNode1 = { stop: jest.fn(), disconnect: jest.fn() };
    const fakeNode2 = { stop: jest.fn(), disconnect: jest.fn() };
    player.activeNodes.push({ node: fakeNode1, chId: 1 });
    player.activeNodes.push({ node: fakeNode2, chId: 2 });

    // Inject a fake buffered renderer with scheduled nodes
    const fakeBuffered: any = {
      scheduledNodes: [
        { src: { stop: jest.fn(), disconnect: jest.fn() }, gain: { disconnect: jest.fn() }, chId: 1 },
        { src: { stop: jest.fn(), disconnect: jest.fn() }, gain: { disconnect: jest.fn() }, chId: 2 },
      ],
      stop: jest.fn(function (cid?: number) {
        // emulate stopping nodes for the given chId
        this.scheduledNodes = this.scheduledNodes.filter((n: any) => (cid == null) || n.chId !== cid);
      }),
      drainScheduledNodes: jest.fn(() => []),
    };
    (player as any)._buffered = fakeBuffered;

    // Verify pre-conditions
    expect(player.activeNodes.length).toBe(2);
    expect((player as any)._buffered.scheduledNodes.length).toBe(2);

    // Call stopChannel for chId=1
    player.stopChannel(1);

    // Node for channel 1 should have been stopped/disconnected and removed
    expect(fakeNode1.stop).toHaveBeenCalled();
    expect(fakeNode1.disconnect).toHaveBeenCalled();
    expect(player.activeNodes.find((e: any) => e.chId === 1)).toBeUndefined();

    // Buffered renderer stop should have been invoked for channel 1
    expect((player as any)._buffered.stop).toHaveBeenCalledWith(1);
    // Remaining buffered nodes should only include chId 2
    expect((player as any)._buffered.scheduledNodes.every((n: any) => n.chId !== 1)).toBe(true);
  });
});
