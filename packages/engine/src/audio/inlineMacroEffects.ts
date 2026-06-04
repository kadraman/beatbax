/** Macro effect types merged into chip `createPlaybackNodes()` instead of generic handlers. */
export const BAKED_INLINE_MACRO_EFFECT_TYPES = [
  'vol_env',
  'arp_env',
  'pitch_env',
  'noise_rate_env',
] as const;

const BAKED_SET = new Set<string>(BAKED_INLINE_MACRO_EFFECT_TYPES);

/** Inline `volSlide` payload attached to an instrument for chip PCM baking. */
export interface InlineVolSlideSpec {
  delta: number;
  steps?: number;
}

export function parseInlineVolSlideEffect(fx: any): InlineVolSlideSpec | null {
  if (!fx || String(fx.type || '').toLowerCase() !== 'volslide') return null;
  if (!fx.params || fx.params.length === 0) return null;
  const delta = Number(fx.params[0]);
  if (!Number.isFinite(delta) || delta === 0) return null;
  const stepsRaw = fx.params.length > 1 ? Number(fx.params[1]) : undefined;
  const steps = stepsRaw !== undefined && Number.isFinite(stepsRaw)
    ? Math.max(1, Math.round(stepsRaw))
    : undefined;
  return { delta, ...(steps !== undefined ? { steps } : {}) };
}

/**
 * Merge inline macro payloads (e.g. `pitch_env:[0,2,0,-2,0]`) into a copy of the
 * instrument so chip backends bake them at render time. Returns effects that still
 * need generic post-render handlers (vib, bend, cut, …).
 */
export function mergeInlineMacroEffectsIntoInst(
  inst: any,
  effects: any[] | undefined,
): { effectiveInst: any; remainingEffects: any[] } {
  if (!Array.isArray(effects) || effects.length === 0) {
    return { effectiveInst: inst, remainingEffects: [] };
  }

  const instOverrides: Record<string, unknown> = {};
  const remainingEffects: any[] = [];

  for (const fx of effects) {
    const fxType = fx && fx.type ? String(fx.type).toLowerCase() : '';
    if (BAKED_SET.has(fxType) && fx.params && fx.params.length > 0) {
      instOverrides[fxType] = fx.params[0];
    } else {
      remainingEffects.push(fx);
    }
  }

  const effectiveInst = Object.keys(instOverrides).length > 0
    ? { ...inst, ...instOverrides }
    : inst;

  return { effectiveInst, remainingEffects };
}

/**
 * Merge chip-baked inline effects (macros + volSlide) into the instrument.
 * AY/SMS BufferSource backends render PCM up front; volSlide must be baked in,
 * not applied via a post-hoc GainNode.
 */
export function applyInlineRenderEffects(
  inst: any,
  effects: any[] | undefined,
): { effectiveInst: any; remainingEffects: any[] } {
  const { effectiveInst: withMacros, remainingEffects: afterMacros } =
    mergeInlineMacroEffectsIntoInst(inst, effects);

  const volSlideFxIndex = afterMacros.findIndex(
    (fx) => String(fx?.type || '').toLowerCase() === 'volslide',
  );
  if (volSlideFxIndex < 0) {
    return { effectiveInst: withMacros, remainingEffects: afterMacros };
  }

  const volSlide = parseInlineVolSlideEffect(afterMacros[volSlideFxIndex]);
  if (!volSlide) {
    return { effectiveInst: withMacros, remainingEffects: afterMacros };
  }

  const remainingEffects = afterMacros.filter((_, i) => i !== volSlideFxIndex);
  return {
    effectiveInst: { ...withMacros, __volSlide: volSlide },
    remainingEffects,
  };
}
