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

// Clear all effect state (called when playback stops/resets)
export const clearEffectState = () => {
  portamentoLastFreq.clear();
};

export const registryAPI: EffectRegistry = {
  register,
  get,
  clearEffectState,
};

export default registryAPI;

// Vibrato effect: create a low-frequency oscillator (LFO) and modulate
// the primary oscillator's frequency AudioParam. Parameters:
//  - params[0]: depth (BeatBax units, scaled to match Game Boy hardware)
//  - params[1]: rate (Hz, default 4)
//
// For Game Boy parity: depth is scaled by VIB_DEPTH_SCALE (4.0) to match
// the UGE exporter, then converted to Hz deviation matching hUGETracker behavior.
register('vib', (ctx: any, nodes: any[], params: any[], start: number, dur: number) => {
  if (!nodes || nodes.length === 0) return;
  const osc = nodes[0];
  if (!osc || !(osc.frequency && typeof osc.frequency.setValueAtTime === 'function')) return;

  const depthRaw = params && params.length > 0 ? Number(params[0]) : 1;
  const rateRaw = params && params.length > 1 ? Number(params[1]) : 4;
  const depth = Number.isFinite(depthRaw) ? depthRaw : 1;
  const rate = Number.isFinite(rateRaw) ? Math.max(0.1, rateRaw) : 4;

  // Determine the base frequency currently assigned to the oscillator at `start`.
  // Fallback to `osc.frequency.value` if AudioParam scheduling isn't available.
  let baseFreq = (osc.frequency && typeof (osc.frequency.value) === 'number') ? osc.frequency.value as number : NaN;
  try {
    // If there is a scheduled value at `start`, attempt to read it; otherwise use current value.
    if (typeof (osc.frequency.getValueAtTime) === 'function') {
      baseFreq = osc.frequency.getValueAtTime(start);
    }
  } catch (e) {
    // Ignore — use fallback value
  }
  if (!Number.isFinite(baseFreq) || baseFreq <= 0) baseFreq = osc.frequency.value || 440;

  // Game Boy-accurate vibrato depth calculation:
  // 1. Scale BeatBax depth (e.g., 3) by VIB_DEPTH_SCALE (4.0) to get tracker nibble (12)
  // 2. Convert tracker nibble to Hz deviation matching hUGETracker's register offset behavior
  //
  // hUGETracker applies the depth nibble as a register offset (adds to period register).
  // For WebAudio smooth LFO, we approximate the Hz deviation this creates.
  //
  // Empirical formula (tuned to match hUGETracker output):
  // amplitudeHz ≈ baseFreq * (trackerDepth * 0.012)
  //
  // This gives ~4.6x larger vibrato than the old semitone formula, matching the
  // measurement: hUGETracker = 1272 cents vs old BeatBax = 276 cents.
  const VIB_DEPTH_SCALE = 4.0; // Must match ugeWriter.ts
  const trackerDepth = Math.max(0, Math.min(15, Math.round(depth * VIB_DEPTH_SCALE)));
  const amplitudeHz = Math.abs(baseFreq * trackerDepth * 0.012);

  if (!Number.isFinite(amplitudeHz) || amplitudeHz <= 0) return;

  try {
    const lfo = (ctx as any).createOscillator();
    const lfoGain = (ctx as any).createGain();
    lfo.type = 'sine';
    try { lfo.frequency.setValueAtTime(rate, start); } catch (_) { lfo.frequency.value = rate; }
    try { lfoGain.gain.setValueAtTime(amplitudeHz, start); } catch (_) { lfoGain.gain.value = amplitudeHz; }
    // Connect LFO -> gain -> oscillator.frequency (AudioParam accepts node input)
    lfo.connect(lfoGain);
    try { lfoGain.connect(osc.frequency); } catch (e) {
      // Some implementations require connecting to an AudioParam via .connect(param)
      try { (lfoGain as any).connect(osc.frequency); } catch (e2) {}
    }

    try { lfo.start(start); } catch (e) { try { lfo.start(); } catch (_) {} }
    // If resolver provided a normalized duration in params[3] (seconds), prefer it
    const vibDurSec = (Array.isArray(params) && typeof params[3] === 'number') ? Number(params[3]) : undefined;
    const stopAt = (typeof vibDurSec === 'number' && vibDurSec > 0) ? (start + vibDurSec + 0.05) : (start + dur + 0.05);
    try { lfo.stop(stopAt); } catch (e) {}
  } catch (e) {
    // Best-effort only; if the environment doesn't support oscillator-based modulation
    // or connections fail, silently skip vibrato.
  }
});

// Portamento effect: smoothly slide the oscillator frequency from the previous
// note's pitch to the current note's pitch. Parameters:
//  - params[0]: speed (0-255, where higher = faster slide)
//
// For Game Boy: speed parameter maps to hUGETracker's 3xx tone portamento,
// where higher values mean faster pitch transitions.
//
// Implementation: We track the last frequency per channel (not per oscillator)
// so portamento works correctly across rests and pattern boundaries.
const portamentoLastFreq = new Map<number, number>();

register('port', (ctx: any, nodes: any[], params: any[], start: number, dur: number, chId?: number) => {
  if (!nodes || nodes.length === 0) return;
  const osc = nodes[0];
  if (!osc || !(osc.frequency && typeof osc.frequency.setValueAtTime === 'function')) return;

  const speedRaw = params && params.length > 0 ? Number(params[0]) : 16;
  const speed = Number.isFinite(speedRaw) ? Math.max(1, Math.min(255, speedRaw)) : 16;

  // Get the target frequency (the current note's pitch)
  let targetFreq = osc.frequency.value;
  if (!Number.isFinite(targetFreq) || targetFreq <= 0) targetFreq = 440;

  // Get the previous note's frequency for this channel
  // Use channel ID (defaults to 0 if not provided for backward compatibility)
  const channelKey = chId ?? 0;
  const lastFreq = portamentoLastFreq.get(channelKey) || targetFreq;

  // Speed scaling: higher speed = shorter portamento time
  // Map speed [1..255] to portamento duration
  // Lower speed = longer slide, higher speed = shorter slide
  const portDuration = Math.max(0.001, (256 - speed) / 256 * dur * 0.6);

  try {
    // Cancel any existing frequency automation
    osc.frequency.cancelScheduledValues(start);
    // Set starting frequency (previous note or current if first note)
    osc.frequency.setValueAtTime(lastFreq, start);

    if (Math.abs(targetFreq - lastFreq) > 1) {
      // Only apply portamento if there's a significant frequency difference
      const safeTarget = Math.max(20, Math.min(20000, targetFreq));
      try {
        // Exponential ramp sounds more musical for pitch changes
        osc.frequency.exponentialRampToValueAtTime(safeTarget, start + portDuration);
      } catch (e) {
        // Fallback to linear if exponential fails (e.g., if lastFreq is too close to 0)
        osc.frequency.linearRampToValueAtTime(safeTarget, start + portDuration);
      }
      // Hold target frequency for remainder of note
      osc.frequency.setValueAtTime(safeTarget, start + portDuration);
    }
  } catch (e) {
    // Best effort - skip portamento if automation fails
  }

  // Store this frequency for the next note on this channel
  portamentoLastFreq.set(channelKey, targetFreq);
});
