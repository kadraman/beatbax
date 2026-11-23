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
});
