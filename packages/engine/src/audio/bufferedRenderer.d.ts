import type TickScheduler from '../scheduler/tickScheduler.js';
export declare class BufferedRenderer {
    private ctx;
    private scheduler;
    private segmentDur;
    private lookahead;
    private segments;
    private pendingRenders;
    private scheduledNodes;
    private maxPreRenderSegments?;
    private applyEffectsToNodes;
    constructor(ctx: BaseAudioContext, scheduler: TickScheduler, opts?: {
        segmentDuration?: number;
        lookahead?: number;
        maxPreRenderSegments?: number;
    });
    private segmentKeyForTime;
    enqueueEvent(absTime: number, dur: number, renderFn: (offlineCtx: OfflineAudioContext) => void, chId?: number): boolean;
    private renderSegment;
    stop(chId?: number): void;
    drainScheduledNodes(chId?: number): {
        src: any;
        gain: any;
        segStart: number;
        chId?: number;
    }[];
    enqueuePulse(absTime: number, freq: number, duty: number, dur: number, inst: any, chId?: number, pan?: any, effects?: any[]): boolean;
    enqueueWavetable(absTime: number, freq: number, table: number[], dur: number, inst: any, chId?: number, pan?: any, effects?: any[]): boolean;
    enqueueNoise(absTime: number, dur: number, inst: any, chId?: number, pan?: any, effects?: any[]): boolean;
}
export default BufferedRenderer;
//# sourceMappingURL=bufferedRenderer.d.ts.map