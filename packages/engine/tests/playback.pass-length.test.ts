/**
 * Player pass length: by default a pass ends at the last scheduled note;
 * `PlayASTOptions.lengthSteps` fixes it so trailing rests are kept.
 */
import { Player } from '../src/audio/playback';

function makeAudioContext(): any {
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
  };
}

// bpm 120 => 0.125 s per step. Each channel ends its 4-step window with rests.
function songWithTrailingRests(repeat: boolean): any {
  const note = { type: 'note', token: 'C4', instProps: { type: 'pulse1', duty: 50 } };
  const rest = { type: 'rest' };
  return {
    chip: 'gameboy',
    bpm: 120,
    insts: {},
    play: { repeat },
    channels: [
      { id: 1, events: [note, rest, rest, rest] },
      { id: 2, events: [note, note, rest, rest] },
    ],
  };
}

describe('Player pass length', () => {
  let player: any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Player.prototype as any, 'scheduleToken').mockImplementation(() => {});
    player = new Player(makeAudioContext());
  });

  afterEach(() => {
    player.stop();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('a repeating pass ends at the last note by default', async () => {
    await player.playAST(songWithTrailingRests(true));
    expect(player._completionTimeoutMs).toBe(250);
  });

  test('lengthSteps keeps trailing rests in a repeating pass', async () => {
    await player.playAST(songWithTrailingRests(true), { lengthSteps: 4 });
    expect(player._completionTimeoutMs).toBe(500);
    const firstEnd = player._loopEndTime;

    player._fireRepeat(player._currentAST);
    expect(player._loopEndTime).toBeCloseTo(firstEnd + 0.5, 6);
  });

  test('lengthSteps sets the completion time of a one-shot pass', async () => {
    await player.playAST(songWithTrailingRests(false), { lengthSteps: 4 });
    expect(player._completionTimeoutMs).toBe(600);
  });

  test('song playback arms the first note 100 ms ahead', async () => {
    const times: number[] = [];
    (Player.prototype as any).scheduleToken.mockImplementation((
      _id: unknown,
      _inst: unknown,
      _map: unknown,
      _token: unknown,
      t: number,
    ) => {
      times.push(t);
    });
    await player.playAST(songWithTrailingRests(false));
    expect(times[0]).toBeCloseTo(0.1, 6);
  });

  test('scheduleLeadSeconds places the first note that far ahead', async () => {
    const times: number[] = [];
    (Player.prototype as any).scheduleToken.mockImplementation((
      _id: unknown,
      _inst: unknown,
      _map: unknown,
      _token: unknown,
      t: number,
    ) => {
      times.push(t);
    });
    await player.playAST(songWithTrailingRests(false), { scheduleLeadSeconds: 0.005 });
    expect(times[0]).toBeCloseTo(0.005, 6);
  });

  test('stop clears the fixed length for the next pass', async () => {
    await player.playAST(songWithTrailingRests(true), { lengthSteps: 4 });
    player.stop();
    await player.playAST(songWithTrailingRests(true));
    expect(player._completionTimeoutMs).toBe(250);
  });
});
