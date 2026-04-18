/**
 * Instrument resolution helpers.
 *
 * This module centralizes mapping instrument names to their property maps
 * and provides utilities for resolving an instrument reference for an
 * event given the instrument table and optional defaults.
 */
import { InstMap } from '../parser/ast.js';
export declare function getInstrumentByName(insts: InstMap, name?: string): import("../parser/ast.js").InstrumentNode | undefined;
export declare function applyInstrumentToEvent(insts: InstMap, event: any): any;
declare const _default: {
    getInstrumentByName: typeof getInstrumentByName;
    applyInstrumentToEvent: typeof applyInstrumentToEvent;
};
export default _default;
//# sourceMappingURL=instrumentState.d.ts.map