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
    ...overrides,
  };
}

describe('Player master volume override', () => {
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
});
