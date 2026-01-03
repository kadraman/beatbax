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
  // Accept alternate property `envelope` (long form) and map it to `env`
  // so downstream renderers that expect `env` continue to work.
  if (inst && typeof inst === 'object') {
    const p = { ...(inst as any) } as any;
    if (p.envelope !== undefined && p.env === undefined) {
      p.env = p.envelope;
    }
    return { ...event, instProps: p, instrument: instName };
  }
  return { ...event, instProps: inst, instrument: instName };
}

export default { getInstrumentByName, applyInstrumentToEvent };
