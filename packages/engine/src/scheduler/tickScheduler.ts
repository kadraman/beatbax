export interface TickSchedulerOptions {
  useRaf?: boolean;
  interval?: number;
  lookahead?: number;
  raf?: (cb: FrameRequestCallback) => number;
  cancelRaf?: (id: number) => void;
  setInterval?: (handler: (...args: any[]) => void, timeout?: number, ...args: any[]) => any;
  clearInterval?: (id: any) => void;
}
import { error } from '../util/diag.js';

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
    const ev = { time, fn };
    // Keep the queue ordered so flushAll/tick can shift without re-sorting.
    // Equal times stay FIFO (insert after existing entries at `time`).
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.queue[mid].time <= time) lo = mid + 1;
      else hi = mid;
    }
    this.queue.splice(lo, 0, ev);
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

  /**
   * Immediately run every queued callback (OfflineAudioContext export).
   * Callbacks still schedule AudioNodes at absolute `time` on the offline
   * timeline; OfflineAudioContext.currentTime stays 0 until startRendering(),
   * so the normal lookahead tick would never drain the queue.
   *
   * Drains earliest-first from the ordered queue so nested `schedule()` calls
   * (retrig, echo cleanup, …) participate in chronological order. The runaway
   * guard limits nested extras beyond the initial queue size; it does not cap
   * how many events may already be queued when flush starts.
   */
  flushAll() {
    const maxNestedExtra = 100000;
    const initial = this.queue.length;
    let processed = 0;
    while (this.queue.length > 0) {
      if (processed >= initial + maxNestedExtra) {
        error('scheduler', `flushAll aborted with ${this.queue.length} events still queued`);
        this.queue = [];
        return;
      }
      const ev = this.queue.shift()!;
      try { ev.fn(); } catch (e) { error('scheduler', 'Scheduled function error: ' + (e && (e as any).message ? (e as any).message : String(e))); }
      processed++;
    }
  }

  private tick() {
    const now = (this.ctx && typeof this.ctx.currentTime === 'number') ? this.ctx.currentTime : (Date.now() / 1000);
    const cutoff = now + this.lookahead;
    while (this.queue.length && this.queue[0].time <= cutoff) {
      const ev = this.queue.shift()!;
      try { ev.fn(); } catch (e) { error('scheduler', 'Scheduled function error: ' + (e && (e as any).message ? (e as any).message : String(e))); }
    }
  }
}

export default TickScheduler;
