export declare function parseEnvelope(envStr: any): any;
export declare function parseSweep(sweepStr: any): {
    time: number;
    direction: "up" | "down";
    shift: number;
} | null;
export declare function playPulse(ctx: BaseAudioContext, freq: number, duty: number, start: number, dur: number, inst: any, scheduler?: any, destination?: AudioNode): any[];
declare const _default: {
    playPulse: typeof playPulse;
};
export default _default;
//# sourceMappingURL=pulse.d.ts.map