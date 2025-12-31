import { EffectHandler, EffectRegistry } from './types.js';

const registry = new Map<string, EffectHandler>();

export const register = (name: string, handler: EffectHandler) => {
  registry.set(name.toLowerCase(), handler);
};

export const get = (name: string): EffectHandler | undefined => registry.get(name.toLowerCase());

// Built-in pan effect
register('pan', (ctx: any, nodes: any[], params: any[], start: number, dur: number) => {
  if (!params || params.length === 0) return;
  // Accept single numeric value or two numbers [from, to]
  const toNum = (v: any) => (typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN));
  const g = nodes && nodes.length >= 2 ? nodes[1] : null;
  if (!g || typeof g.connect !== 'function') return;

  const pVal = toNum(params[0]);
  const hasEnd = params.length >= 2 && !Number.isNaN(toNum(params[1]));
  const createPanner = (ctx as any).createStereoPanner;
  if (typeof createPanner === 'function') {
    const panner = (ctx as any).createStereoPanner();
    try { panner.pan.setValueAtTime(Number.isFinite(pVal) ? pVal : 0, start); } catch (e) { try { (panner as any).pan.value = pVal; } catch (e2) {} }
    g.disconnect((ctx as any).destination);
    g.connect(panner);
    panner.connect((ctx as any).destination);
    if (hasEnd) {
      const endVal = toNum(params[1]);
      try { panner.pan.linearRampToValueAtTime(endVal, start + dur); } catch (e) {}
    }
  } else {
    // No StereoPanner support — best-effort: do nothing
  }
});

export const registryAPI: EffectRegistry = {
  register,
  get,
};

export default registryAPI;
