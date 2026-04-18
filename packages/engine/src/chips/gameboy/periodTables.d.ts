export declare const GB_CLOCK = 4194304;
/**
 * Standard Game Boy period table used by hUGETracker.
 * Covers 72 notes (6 octaves), starting from C2 (MIDI 36).
 * Index 0 = C2, Index 12 = C3, etc.
 */
export declare const GB_PERIOD_TABLE: number[];
export declare function freqFromRegister(reg: number): number;
export declare function registerFromFreq(freq: number): number;
declare const _default: {
    GB_CLOCK: number;
    freqFromRegister: typeof freqFromRegister;
    registerFromFreq: typeof registerFromFreq;
};
export default _default;
//# sourceMappingURL=periodTables.d.ts.map