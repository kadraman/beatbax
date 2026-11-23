import { TickScheduler } from '../src/scheduler/tickScheduler';

describe('tick scheduler', () => {
  test('TickScheduler class is constructible', () => {
    expect(typeof TickScheduler).toBe('function');
  });

  test('flushAll runs nested schedule callbacks in chronological order', () => {
    const ctx = { currentTime: 0 };
    const sched = new TickScheduler(ctx as any);
    const order: number[] = [];
    sched.schedule(1, () => {
      order.push(1);
      sched.schedule(2, () => { order.push(2); });
    });
    sched.schedule(3, () => { order.push(3); });
    sched.flushAll();
    expect(order).toEqual([1, 2, 3]);
  });

  test('flushAll drains more than 100000 initially queued callbacks', () => {
    const ctx = { currentTime: 0 };
    const sched = new TickScheduler(ctx as any);
    const n = 100001;
    let ran = 0;
    for (let i = 0; i < n; i++) {
      sched.schedule(i, () => { ran++; });
    }
    sched.flushAll();
    expect(ran).toBe(n);
  });

  test('flushAll still aborts runaway nested scheduling', () => {
    const ctx = { currentTime: 0 };
    const sched = new TickScheduler(ctx as any);
    let ticks = 0;
    const recur = () => {
      ticks++;
      sched.schedule(ticks, recur);
    };
    sched.schedule(0, recur);
    sched.flushAll();
    // One initial callback plus 100000 nested extras, then abort.
    expect(ticks).toBe(100001);
  });
});
