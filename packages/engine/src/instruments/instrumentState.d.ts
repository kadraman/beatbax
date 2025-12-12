/**
 * Instrument resolution helpers.
 *
 * This module centralizes mapping instrument names to their property maps
 * and provides utilities for resolving an instrument reference for an
 * event given the instrument table and optional defaults.
 */
export declare function getInstrumentByName(insts: Record<string, Record<string, string>>, name?: string): Record<string, string> | undefined;
export declare function applyInstrumentToEvent(insts: Record<string, Record<string, string>>, event: any): any;
declare const _default: {
    getInstrumentByName: typeof getInstrumentByName;
    applyInstrumentToEvent: typeof applyInstrumentToEvent;
};
export default _default;
//# sourceMappingURL=instrumentState.d.ts.map