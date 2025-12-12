import { Player } from '../src/audio/playback';

describe('stop channel', () => {
  test('Player.stopChannel exists', () => {
    expect(typeof Player === 'function').toBeTruthy();
    expect(typeof (Player.prototype as any).stopChannel === 'function').toBeTruthy();
  });
});
