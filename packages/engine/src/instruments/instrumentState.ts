/**
 * Instrument resolution helpers.
 *
 * This module centralizes mapping instrument names to their property maps
 * and provides utilities for resolving an instrument reference for an
 * event given the instrument table and optional defaults.
 */
import { InstMap } from '../parser/ast.js';

export function getInstrumentByName(insts: InstMap, name?: string) {
  if (!name) return undefined;
  return insts[name] || undefined;
}

export function applyInstrumentToEvent(insts: InstMap, event: any) {
  if (!event || !event.instrument) return event;
  const instName = event.instrument;
  const inst = getInstrumentByName(insts, instName);
  // attach resolved instrument object under `instProps` for downstream consumers
  return { ...event, instProps: inst, instrument: instName };
}

export default { getInstrumentByName, applyInstrumentToEvent };
