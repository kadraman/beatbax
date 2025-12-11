export interface TickSchedulerOptions {
  useRaf?: boolean;
  interval?: number;
  lookahead?: number;
  raf?: (cb: FrameRequestCallback) => number;
  cancelRaf?: (id: number) => void;
  setInterval?: (handler: (...args: any[]) => void, timeout?: number, ...args: any[]) => any;
  clearInterval?: (id: any) => void;
}

export class TickScheduler {
  private ctx: any;
  private lookahead: number;
  private interval: number;
  private timer: any = null;
  private rafId: number | null = null;
  private queue: Array<{ time: number; fn: () => void }> = [];
  private opts: TickSchedulerOptions;

  constructor(ctx: any, opts: TickSchedulerOptions = {}) {
    this.ctx = ctx;
    this.opts = opts;
    this.lookahead = typeof opts.lookahead === 'number' ? opts.lookahead : 0.1;
    this.interval = typeof opts.interval === 'number' ? opts.interval : 25;
  }

  schedule(time: number, fn: () => void) {
    this.queue.push({ time, fn });
    this.queue.sort((a, b) => a.time - b.time);
  }

  scheduleAligned(time: number, fn: () => void, frameHz = 512) {
    if (!isFinite(time) || frameHz <= 0) return this.schedule(time, fn);
    const framePeriod = 1 / frameHz;
    const aligned = Math.round(time / framePeriod) * framePeriod;
    this.schedule(aligned, fn);
  }

  start() {
    if (this.timer || this.rafId) return;
    const useRaf = !!this.opts.useRaf;
    const rafFn = this.opts.raf || (typeof (globalThis as any).requestAnimationFrame === 'function' ? (globalThis as any).requestAnimationFrame.bind(globalThis) : null);
    if (useRaf && rafFn) {
      const loop = () => {
        this.tick();
        this.rafId = rafFn(loop);
      };
      this.rafId = rafFn(loop);
      return;
    }

    const setInt = this.opts.setInterval || setInterval.bind(globalThis);
    this.timer = setInt(() => this.tick(), this.interval);
  }

  stop() {
    if (this.timer) {
      const clearInt = this.opts.clearInterval || clearInterval.bind(globalThis);
      clearInt(this.timer);
      this.timer = null;
    }
    if (this.rafId !== null) {
      const cancel = this.opts.cancelRaf || (typeof (globalThis as any).cancelAnimationFrame === 'function' ? (globalThis as any).cancelAnimationFrame.bind(globalThis) : null);
      if (cancel) cancel(this.rafId);
      this.rafId = null;
    }
  }

  clear() {
    this.queue = [];
  }

  private tick() {
    const now = (this.ctx && typeof this.ctx.currentTime === 'number') ? this.ctx.currentTime : (Date.now() / 1000);
    const cutoff = now + this.lookahead;
    while (this.queue.length && this.queue[0].time <= cutoff) {
      const ev = this.queue.shift()!;
      try { ev.fn(); } catch (e) { console.error('Scheduled function error', e); }
    }
  }
}

export default TickScheduler;
