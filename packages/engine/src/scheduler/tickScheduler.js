import { error } from '../util/diag.js';
export class TickScheduler {
    ctx;
    lookahead;
    interval;
    timer = null;
    rafId = null;
    queue = [];
    opts;
    constructor(ctx, opts = {}) {
        this.ctx = ctx;
        this.opts = opts;
        this.lookahead = typeof opts.lookahead === 'number' ? opts.lookahead : 0.1;
        this.interval = typeof opts.interval === 'number' ? opts.interval : 25;
    }
    schedule(time, fn) {
        this.queue.push({ time, fn });
        this.queue.sort((a, b) => a.time - b.time);
    }
    scheduleAligned(time, fn, frameHz = 512) {
        if (!isFinite(time) || frameHz <= 0)
            return this.schedule(time, fn);
        const framePeriod = 1 / frameHz;
        const aligned = Math.round(time / framePeriod) * framePeriod;
        this.schedule(aligned, fn);
    }
    start() {
        if (this.timer || this.rafId)
            return;
        const useRaf = !!this.opts.useRaf;
        const rafFn = this.opts.raf || (typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame.bind(globalThis) : null);
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
            const cancel = this.opts.cancelRaf || (typeof globalThis.cancelAnimationFrame === 'function' ? globalThis.cancelAnimationFrame.bind(globalThis) : null);
            if (cancel)
                cancel(this.rafId);
            this.rafId = null;
        }
    }
    clear() {
        this.queue = [];
    }
    tick() {
        const now = (this.ctx && typeof this.ctx.currentTime === 'number') ? this.ctx.currentTime : (Date.now() / 1000);
        const cutoff = now + this.lookahead;
        while (this.queue.length && this.queue[0].time <= cutoff) {
            const ev = this.queue.shift();
            try {
                ev.fn();
            }
            catch (e) {
                error('scheduler', 'Scheduled function error: ' + (e && e.message ? e.message : String(e)));
            }
        }
    }
}
export default TickScheduler;
//# sourceMappingURL=tickScheduler.js.map