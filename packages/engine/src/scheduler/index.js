import TickScheduler from './tickScheduler.js';
export function createScheduler(ctx, opts = {}) {
    const isBrowser = typeof globalThis.requestAnimationFrame === 'function';
    const useRaf = typeof opts.useRaf === 'boolean' ? opts.useRaf : isBrowser;
    return new TickScheduler(ctx, { ...opts, useRaf });
}
export { TickScheduler };
export default createScheduler;
//# sourceMappingURL=index.js.map