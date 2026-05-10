import type { InstrumentNode } from '@beatbax/engine';

function parseBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const normalized = v.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

export function shouldUseEnvelope(inst: InstrumentNode): boolean {
  const env = String(inst.env ?? 'none').toLowerCase();
  const explicit = parseBoolean(inst.use_envelope);
  if (explicit !== null) return explicit;

  if (typeof inst.vol === 'string' && inst.vol.toLowerCase() === 'use_envelope') {
    return true;
  }

  return inst.vol === undefined && env !== 'none';
}
