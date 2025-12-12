import { TickScheduler } from '../src/scheduler/tickScheduler';

describe('tick scheduler', () => {
  test('TickScheduler class is constructible', () => {
    expect(typeof TickScheduler).toBe('function');
  });
});
