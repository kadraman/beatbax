export interface TickSchedulerOptions {
    useRaf?: boolean;
    interval?: number;
    lookahead?: number;
    raf?: (cb: FrameRequestCallback) => number;
    cancelRaf?: (id: number) => void;
    setInterval?: (handler: (...args: any[]) => void, timeout?: number, ...args: any[]) => any;
    clearInterval?: (id: any) => void;
}
export declare class TickScheduler {
    private ctx;
    private lookahead;
    private interval;
    private timer;
    private rafId;
    private queue;
    private opts;
    constructor(ctx: any, opts?: TickSchedulerOptions);
    schedule(time: number, fn: () => void): void;
    scheduleAligned(time: number, fn: () => void, frameHz?: number): void;
    start(): void;
    stop(): void;
    clear(): void;
    private tick;
}
export default TickScheduler;
//# sourceMappingURL=tickScheduler.d.ts.map