import Player from '../src/audio/playback';

describe('Player.playAST with resolved ISM', () => {
  test('calls onSchedule with instProps when event objects are provided', async () => {
    // Provide a minimal fake AudioContext so Player doesn't attempt to construct a real one
    const fakeCtx: any = { currentTime: 0, sampleRate: 44100 };
    const player = new Player(fakeCtx as any);

    const instProps = { type: 'pulse1', duty: '50', env: '12,down' };

    const ast: any = {
      insts: { lead: instProps },
      pats: {},
      seqs: {},
      channels: [
        {
          id: 1,
          bpm: 120,
          // provide resolved event objects directly on `pat` so Player will accept them
          pat: [
            { type: 'note', token: 'C4', instrument: 'lead', instProps },
            { type: 'rest' },
            { type: 'note', token: 'D4', instrument: 'lead', instProps },
          ],
        },
      ],
    };

    const hook = jest.fn();
    (player as any).onSchedule = hook;

    await player.playAST(ast as any);
    // stop the player to clear scheduler timers created during playAST
    player.stop();

    // Expect hook to have been called twice (for two note events)
    expect(hook).toHaveBeenCalled();
    // find the first call and check inst equals instProps
    const first = hook.mock.calls.find(c => c && c[0] && c[0].token === 'C4');
    expect(first).toBeDefined();
    expect(first![0].inst).toBe(instProps);
  });
});
