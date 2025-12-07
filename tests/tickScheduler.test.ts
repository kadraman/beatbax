import TickScheduler from '../src/scheduler/tickScheduler';

describe('TickScheduler (timer modes)', () => {
  test('interval mode uses injected setInterval and processes scheduled callbacks', () => {
    const executed: string[] = [];
    const ctx: any = { currentTime: 0 };

    let storedHandler: Function | null = null;
    const fakeSetInterval = (handler: (...args: any[]) => void) => {
      storedHandler = handler;
      return 123;
    };
    const fakeClearInterval = jest.fn();

    const sched = new TickScheduler(ctx, { setInterval: fakeSetInterval, clearInterval: fakeClearInterval, lookahead: 0.1 });
    sched.start();
    expect(typeof storedHandler).toBe('function');

    // Schedule two events: one within lookahead, one later
    sched.schedule(0.05, () => executed.push('a'));
    sched.schedule(1.0, () => executed.push('b'));

    // First tick should execute only the first event
    (storedHandler as any)();
    expect(executed).toEqual(['a']);

    // Advance time beyond second event and tick again
    ctx.currentTime = 1.0;
    (storedHandler as any)();
    expect(executed).toEqual(['a', 'b']);

    sched.stop();
    expect(fakeClearInterval).toHaveBeenCalled();
  });

  test('raf mode uses injected raf and cancelRaf, and processes scheduled callbacks', () => {
    const executed: string[] = [];
    const ctx: any = { currentTime: 0 };

    let storedCb: FrameRequestCallback | null = null;
    const fakeRaf = (cb: FrameRequestCallback) => {
      storedCb = cb;
      return 7;
    };
    const fakeCancel = jest.fn();

    const sched = new TickScheduler(ctx, { useRaf: true, raf: fakeRaf, cancelRaf: fakeCancel, lookahead: 0.1 });
    sched.start();
    expect(typeof storedCb).toBe('function');

    sched.schedule(0.02, () => executed.push('x'));

    // Simulate one RAF frame: call the stored callback which will run tick()
    (storedCb as any)(0);
    expect(executed).toEqual(['x']);

    sched.stop();
    expect(fakeCancel).toHaveBeenCalledWith(expect.any(Number));
  });
});
