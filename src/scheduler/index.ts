import TickScheduler, { TickSchedulerOptions } from './tickScheduler';

/**
 * Factory: create a TickScheduler configured for the current environment.
 * In a browser, RAF is preferred by default; in Node.js, interval timer is used.
 */
export function createScheduler(ctx: any, opts: TickSchedulerOptions = {}) {
  const isBrowser = typeof (globalThis as any).requestAnimationFrame === 'function';
  const useRaf = typeof opts.useRaf === 'boolean' ? opts.useRaf : isBrowser;
  return new TickScheduler(ctx, { ...opts, useRaf });
}

export { TickScheduler };

export default createScheduler;

export type { TickSchedulerOptions };
