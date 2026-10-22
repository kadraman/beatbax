/**
 * Draft helpers for Instrument Editor Live edit / Apply (spec 099).
 */

import type { InstrumentNode } from '@beatbax/engine';

/** Drop host-only keys before compare / preview patch. */
export function stripInstrumentDraftMeta(node: InstrumentNode | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!node || typeof node !== 'object') return {};
  const { __loc: _loc, ...rest } = node as InstrumentNode & { __loc?: unknown };
  return { ...rest };
}

/** Stable JSON for dirty comparison (sorted keys, meta stripped). */
export function instrumentDraftFingerprint(node: InstrumentNode | Record<string, unknown> | null | undefined): string {
  const plain = stripInstrumentDraftMeta(node);
  return JSON.stringify(sortKeysDeep(plain));
}

export function isInstrumentDraftDirty(
  baseline: InstrumentNode | Record<string, unknown> | null | undefined,
  draft: InstrumentNode | Record<string, unknown> | null | undefined,
): boolean {
  return instrumentDraftFingerprint(baseline) !== instrumentDraftFingerprint(draft);
}

/**
 * Props to merge onto the AST instrument for audition when the panel draft
 * differs from source (Live edit off).
 */
export function instrumentDraftPreviewPatch(
  draft: InstrumentNode | Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return stripInstrumentDraftMeta(draft);
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeysDeep(obj[key]);
    }
    return out;
  }
  return value;
}
