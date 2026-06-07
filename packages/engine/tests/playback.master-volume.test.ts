/**
 * Tests for Player master volume override behavior.
 */
import { Player } from '../src/audio/playback';

function makeAudioContext(overrides: Record<string, any> = {}): any {
  return {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination: { connect: jest.fn() },
    createGain: () => ({
      gain: { setValueAtTime: jest.fn(), value: 1 },
      connect: jest.fn(),
      disconnect: jest.fn(),
    }),
    createDynamicsCompressor: () => ({
      threshold: { setValueAtTime: jest.fn() },
      knee: { setValueAtTime: jest.fn() },
      ratio: { setValueAtTime: jest.fn() },
      attack: { setValueAtTime: jest.fn() },
      release: { setValueAtTime: jest.fn() },
      connect: jest.fn(),
      disconnect: jest.fn(),
    }),
    ...overrides,
  };
}

describe('Player master volume override', () => {
  test('setMasterVolume wires master gain through limiter to destination', () => {
    const gainNode = {
      gain: { setValueAtTime: jest.fn(), value: 1 },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    const limiterNode = {
      threshold: { setValueAtTime: jest.fn() },
      knee: { setValueAtTime: jest.fn() },
      ratio: { setValueAtTime: jest.fn() },
      attack: { setValueAtTime: jest.fn() },
      release: { setValueAtTime: jest.fn() },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    const destination = { connect: jest.fn() };
    const ctx = makeAudioContext({
      destination,
      createGain: () => gainNode,
      createDynamicsCompressor: () => limiterNode,
    });
    const player: any = new Player(ctx);

    player.setMasterVolume(0.6);

    expect(gainNode.connect).toHaveBeenCalledWith(limiterNode);
    expect(limiterNode.connect).toHaveBeenCalledWith(destination);
    expect(limiterNode.threshold.setValueAtTime).toHaveBeenCalledWith(-6, ctx.currentTime);
  });

  test('setMasterVolume creates masterGain immediately and stores override', () => {
    const ctx = makeAudioContext();
    const player: any = new Player(ctx);

    player.setMasterVolume(0);

    expect(player._userMasterVolumeOverride).toBe(0);
    expect(player.masterGain).not.toBeNull();
    expect(player.masterGain?.gain.setValueAtTime).toHaveBeenCalledWith(0, ctx.currentTime);
  });

  test('setMasterVolume clamps values and remembers explicit user override', () => {
    const ctx = makeAudioContext();
    const player: any = new Player(ctx);

    player.setMasterVolume(1.5);
    expect(player._userMasterVolumeOverride).toBe(1);
    expect(player.masterGain?.gain.setValueAtTime).toHaveBeenCalledWith(1, ctx.currentTime);

    player.setMasterVolume(-1);
    expect(player._userMasterVolumeOverride).toBe(0);
    expect(player.masterGain?.gain.setValueAtTime).toHaveBeenCalledWith(0, ctx.currentTime);
  });

  test('setMasterVolume rewires limiter chain without blanket masterGain.disconnect()', () => {
    const gainNode = {
      gain: { setValueAtTime: jest.fn(), value: 1 },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    const limiterNode = {
      threshold: { setValueAtTime: jest.fn() },
      knee: { setValueAtTime: jest.fn() },
      ratio: { setValueAtTime: jest.fn() },
      attack: { setValueAtTime: jest.fn() },
      release: { setValueAtTime: jest.fn() },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    const analyserTap = { connect: jest.fn(), disconnect: jest.fn() };
    const destination = { connect: jest.fn() };
    const ctx = makeAudioContext({
      destination,
      createGain: () => gainNode,
      createDynamicsCompressor: () => limiterNode,
    });
    const player: any = new Player(ctx);

    player.setMasterVolume(0.5);
    gainNode.connect(analyserTap);
    gainNode.disconnect.mockClear();
    limiterNode.disconnect.mockClear();

    player.setMasterVolume(0.8);

    expect(gainNode.disconnect).not.toHaveBeenCalledWith();
    expect(gainNode.disconnect).toHaveBeenCalledWith(limiterNode);
    expect(gainNode.disconnect).toHaveBeenCalledWith(destination);
    expect(limiterNode.disconnect).toHaveBeenCalledWith(destination);
    expect(limiterNode.disconnect).not.toHaveBeenCalledWith();
    expect(gainNode.connect).toHaveBeenCalledWith(limiterNode);
    expect(limiterNode.connect).toHaveBeenCalledWith(destination);
  });

  test('setMasterVolume without compressor disconnects only destination sink', () => {
    const gainNode = {
      gain: { setValueAtTime: jest.fn(), value: 1 },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    const analyserTap = { connect: jest.fn(), disconnect: jest.fn() };
    const destination = { connect: jest.fn() };
    const ctx = makeAudioContext({
      destination,
      createGain: () => gainNode,
      createDynamicsCompressor: undefined,
    });
    const player: any = new Player(ctx);

    player.setMasterVolume(0.5);
    gainNode.connect(analyserTap);
    gainNode.disconnect.mockClear();

    player.setMasterVolume(0.8);

    expect(gainNode.disconnect).not.toHaveBeenCalledWith();
    expect(gainNode.disconnect).toHaveBeenCalledWith(destination);
    expect(gainNode.connect).toHaveBeenCalledWith(destination);
  });
});
