import { Player } from '../src/audio/playback';

describe('playback expansion -> scheduled events', () => {
  test('schedules notes and respects temporary inst(name,N) overrides', async () => {
    // Build a minimal AST: one channel with a default pulse inst and a temp noise override
    const ast: any = {
      insts: {
        lead: { type: 'pulse1', duty: 50, env: '12,down' },
        sn: { type: 'noise', env: '8,down' }
      },
      channels: [
        {
          id: 1,
          inst: 'lead',
          pat: ['C4', 'D4', 'inst(sn,2)', 'C4', 'C4', '.', 'E4']
        }
      ]
    };

    // Create a player with a fake context (only currentTime needed)
    const fakeCtx: any = { currentTime: 0 };
    const player = new Player(fakeCtx as any);

    // Replace internal scheduler with a recorder so no timers run
    const scheduled: Array<{ time: number; fn: Function }> = [];
    (player as any).scheduler = {
      schedule: (time: number, fn: Function) => scheduled.push({ time, fn }),
      start: () => {},
      stop: () => {},
      clear: () => { scheduled.length = 0; }
    } as any;

    await player.playAST(ast);

    // Determine which tokens should have scheduled events:
    // tokens: C4 (note), D4 (note), inst(sn,2) -> no sound, C4(note uses temp sn), C4(note uses temp sn second), . -> rest, E4(note uses default lead)
    // Therefore scheduled events should be: C4, D4, C4, C4, E4 => 5 events
    expect(scheduled.length).toBe(5);

    // Inspect scheduled function source to detect whether noise or pulse playback is used
    const sources = scheduled.map(s => s.fn.toString());

    // First two events should be pulse (default lead)
    expect(sources[0]).toMatch(/playPulse\(/);
    expect(sources[1]).toMatch(/playPulse\(/);

    // Next two events (after inst(sn,2)) should use noise (temp override)
    expect(sources[2]).toMatch(/playNoise\(/);
    expect(sources[3]).toMatch(/playNoise\(/);

    // Final event after the rest should revert to pulse
    expect(sources[4]).toMatch(/playPulse\(/);
  });
});
