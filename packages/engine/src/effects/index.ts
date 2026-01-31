import { EffectHandler, EffectRegistry } from './types.js';
import { warn } from '../util/diag.js';
import { parseEnvelope } from '../chips/gameboy/pulse.js';

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
    // Disconnect from all destinations (handles both masterGain and ctx.destination cases)
    try { g.disconnect(); } catch (e) {}
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

// Arpeggio effect: rapidly cycle through pitch offsets to simulate chords.
// Parameters:
//  - params[0..N]: semitone offsets from the base note (e.g., 0, 4, 7 for major triad)
//
// hUGETracker's 0xy effect uses 2 nibbles to encode 2 offsets (x and y).
// BeatBax supports 3-4 note arpeggios by accepting multiple comma-separated offsets.
// For UGE export: only the first 2 offsets are exported (3-note arpeggio); if more
// offsets are provided, a warning is shown.
//
// Implementation: Cycle through pitch offsets at 60Hz (Game Boy frame rate).
// Each arpeggio step lasts exactly 1 frame (~16.667ms), independent of BPM.
// For a note spanning 7 ticks (Speed=7) with a 3-note arpeggio:
//   Plays 7 notes in ~117ms: Root → +x → +y → Root → +x → +y → Root
// This rapid cycling creates the illusion of hearing a chord.
register('arp', (ctx: any, nodes: any[], params: any[], start: number, dur: number, chId?: number, tickSeconds?: number) => {
  if (!nodes || nodes.length === 0) return;
  const osc = nodes[0];
  if (!osc || !(osc.frequency && typeof osc.frequency.setValueAtTime === 'function')) return;

  // Parse semitone offsets from parameters (filter out non-numeric values)
  const rawOffsets = (params || []).map(p => Number(p));
  const negativeOffsets = rawOffsets.filter(n => Number.isFinite(n) && n < 0);

  if (negativeOffsets.length > 0) {
    warn('effect', `Arpeggio effect contains negative offsets [${negativeOffsets.join(', ')}]. hUGETracker's 0xy format only supports offsets 0-15. Negative offsets will be ignored.`);
  }

  const offsets = rawOffsets.filter(n => Number.isFinite(n) && n >= 0);

  if (offsets.length === 0) return;

  // Get the base frequency (the current note's pitch)
  // Use _baseFreq if available (stored by playPulse), otherwise fallback to .value
  let baseFreq = (osc as any)._baseFreq || osc.frequency.value;
  if (!Number.isFinite(baseFreq) || baseFreq <= 0) baseFreq = 440;

  // Arpeggio timing: advances at the chip's native frame rate.
  // Each tick = 1 frame, independent of BPM or musical tempo.
  // For Speed=7 (7 ticks per row) with 3-note arpeggio:
  //   Root → +x → +y → Root → +x → +y → Root (7 notes)
  // This rapid cycling creates the chord illusion.

  // Chip frame rates (Hz) - based on TV standards and hardware specs
  // Note: Defaults reflect the dominant market/scene for each chip:
  // - C64: 50 Hz (PAL) because the European demoscene/SID music community was dominant
  // - Others: 60 Hz (NTSC) due to Japanese/North American market dominance or global standard
  const CHIP_FRAME_RATES: Record<string, number> = {
    'gameboy': 60,      // Game Boy: ~59.73 Hz (global standard, not TV-dependent)
    'nes': 60,          // NES: ~60 Hz NTSC (North American market dominant)
    'c64': 50,          // C64 SID: 50 Hz PAL (European demoscene/music dominant)
    'genesis': 60,      // Sega Genesis: ~60 Hz NTSC (NA/Japan markets)
    'megadrive': 60,    // Alias for Genesis
    'pcengine': 60,     // PC Engine: ~60 Hz (Japan/NA markets)
  };

  const chipType = ((ctx as any)._chipType || 'gameboy').toLowerCase();
  const frameRate = CHIP_FRAME_RATES[chipType] || 60; // Default to 60 Hz
  const stepDuration = 1 / frameRate;

  try {
    // Cancel any existing frequency automation
    osc.frequency.cancelScheduledValues(start);

    // hUGETracker arpeggio always includes the root note first
    // For offsets [3, 7], the cycle is: Root (0) → +3 → +7 → Root → ...
    const allOffsets = [0, ...offsets];

    // Calculate frequencies for each offset
    // Formula: freq = baseFreq * 2^(semitones / 12)
    const frequencies = allOffsets.map(offset => baseFreq * Math.pow(2, offset / 12));

    // Schedule frequency changes at the chip's native frame rate (e.g., 60Hz for Game Boy, 50Hz for C64)
    // Each note in the arpeggio lasts exactly one frame (e.g., ~16.667ms at 60Hz, ~20ms at 50Hz)
    let currentTime = start;
    const endTime = start + dur;

    // Schedule the arpeggio cycle for the entire note duration
    while (currentTime < endTime) {
      for (let i = 0; i < frequencies.length && currentTime < endTime; i++) {
        const freq = frequencies[i];
        const safeFreq = Math.max(20, Math.min(20000, freq));

        // Schedule this frequency to start at currentTime
        osc.frequency.setValueAtTime(safeFreq, currentTime);
        currentTime += stepDuration; // Advance by one chip frame (1/frameRate second)
      }
    }

    // Hold the last frequency until the end of the note
    // (Don't reset to base - let it naturally transition)
  } catch (e) {
    // Best effort - skip arpeggio if automation fails
  }
});

// Volume Slide effect: smoothly increase or decrease volume over time.
// Parameters:
//  - params[0]: delta per tick or step (+N = fade in, -N = fade out)
//  - params[1]: (optional) number of steps/ticks for the slide
//
// hUGETracker's Axy effect: x = slide up speed (0-15), y = slide down speed (0-15)
// BeatBax uses signed delta: positive = slide up, negative = slide down
//
// Implementation: Apply linear gain ramp from instrument's envelope initial volume
// to target volume over the note duration. For per-tick slides, apply stepped automation.
// The baseline is derived from the instrument's envelope initial volume (0-15 on Game Boy).
//
// ARCHITECTURAL LIMITATION: This implementation cancels existing gain automation on the
// same GainNode used for envelope automation, effectively disabling instrument envelopes
// when volume slide is active. To properly support stacking with envelopes, this should
// use a separate gain stage (additional GainNode in the audio graph after envelope gain)
// or apply volume slide via an independent parameter/node without canceling automation.
register('volSlide', (ctx: any, nodes: any[], params: any[], start: number, dur: number, chId?: number, tickSeconds?: number, inst?: any) => {
  if (!nodes || nodes.length < 2) return;
  const gain = nodes[1];
  if (!gain || !gain.gain) {
    warn('effects', `Volume slide: gain node is missing or invalid for channel ${chId || '?'}`);
    return;
  }

  const gainParam = gain.gain;
  if (!gainParam || typeof gainParam.setValueAtTime !== 'function') {
    warn('effects', `Volume slide: gain.gain AudioParam is invalid for channel ${chId || '?'}`);
    return;
  }

  const deltaRaw = params && params.length > 0 ? Number(params[0]) : 0;
  const stepsRaw = params && params.length > 1 ? Number(params[1]) : undefined;
  const delta = Number.isFinite(deltaRaw) ? deltaRaw : 0;
  const steps = (stepsRaw !== undefined && Number.isFinite(stepsRaw)) ? Math.max(1, Math.round(stepsRaw)) : undefined;

  if (delta === 0) return; // No volume change

  // Extract instrument envelope initial volume (0-15 on Game Boy, normalized to 0-1)
  // If no instrument or envelope data available, fall back to 1.0 (full volume)
  let baselineGain = 1.0;
  if (inst && inst.env) {
    try {
      // Parse envelope to get initial volume (handles both string and object formats)
      const env = parseEnvelope(inst.env);
      if (env && env.mode === 'gb' && typeof env.initial === 'number') {
        baselineGain = Math.max(0, Math.min(1, env.initial / 15)); // Normalize to [0, 1]
      }
    } catch (e) {
      // Fall back to 1.0 if parsing fails
      warn('effects', `Volume slide: envelope parsing failed for channel ${chId || '?'}, using default baseline`);
      baselineGain = 1.0;
    }
  }

  try {
    // LIMITATION: Canceling scheduled values wipes envelope automation on this GainNode.
    // Volume slides currently REPLACE envelopes rather than stacking with them.
    // To fix: use a separate gain stage or avoid cancelScheduledValues.
    if (typeof gainParam.cancelScheduledValues === 'function') {
      gainParam.cancelScheduledValues(start);
    }
    gainParam.setValueAtTime(baselineGain, start);

    if (steps !== undefined && tickSeconds !== undefined) {
      // Stepped volume slide: apply delta at each step interval with hard transitions
      // For truly discrete steps in WebAudio, we need to hold each value constant
      // until the next step boundary
      // NOTE: Use larger scaling factor (÷3 instead of ÷5) for stepped slides to make
      // steps more audible in WebAudio which has inherent smoothing
      const stepDuration = dur / steps;
      const scaleFactor = 3; // More aggressive scaling for stepped slides

      // Set initial value and hold it until first step
      gainParam.setValueAtTime(baselineGain, start);

      for (let i = 1; i <= steps; i++) {
        const stepTime = start + (i * stepDuration);
        // Calculate volume for this step: evenly distribute delta across steps
        const stepGain = Math.max(0.001, Math.min(1.5, baselineGain + (delta * i / steps / scaleFactor)));

        // Hold previous value right up to step boundary
        const prevGain = i === 1 ? baselineGain : Math.max(0.001, Math.min(1.5, baselineGain + (delta * (i-1) / steps / scaleFactor)));
        gainParam.setValueAtTime(prevGain, stepTime - 0.00001);

        // Jump to new value at step boundary
        gainParam.setValueAtTime(stepGain, stepTime);
      }

      // Hold final value until note end
      const finalGain = Math.max(0.001, Math.min(1.5, baselineGain + (delta / scaleFactor)));
      gainParam.setValueAtTime(finalGain, start + dur);
    } else {
      // Smooth volume slide: linear ramp over note duration
      // Scale delta to reasonable range: delta ±1 = ±0.2 gain change per note (more audible)
      // Allow volume to increase above baseline up to 1.5x (some headroom for boosts)
      const targetGain = Math.max(0, Math.min(1.5, baselineGain + (delta / 5)));
      gainParam.linearRampToValueAtTime(targetGain, start + dur);
    }
  } catch (e) {
    warn('effects', `Volume slide failed for channel ${chId || '?'}: ${e}`);
  }
});
// Tremolo effect: create a low-frequency oscillator (LFO) and modulate the gain
// (amplitude) to create volume oscillation. Parameters:
//  - params[0]: depth (0-15, where 15 = maximum amplitude modulation)
//  - params[1]: rate (Hz, speed of the tremolo oscillation, default 6)
//  - params[2]: waveform (optional, default 'sine')
//  - params[3]: duration in seconds (normalized from durationRows by resolver)
//
// Similar to vibrato but modulates volume instead of pitch. This creates a pulsating
// or "shimmering" effect commonly used for atmospheric sounds, sustained notes,
// and adding movement to static tones.
//
// MIDI export: Documented via text meta event (MIDI has no native tremolo)
// UGE export: Can be approximated with volume column automation or effect commands
register('trem', (ctx: any, nodes: any[], params: any[], start: number, dur: number) => {
  if (!nodes || nodes.length < 2) return;
  const gain = nodes[1];
  if (!gain || !gain.gain || typeof gain.gain.setValueAtTime !== 'function') return;

  const depthRaw = params && params.length > 0 ? Number(params[0]) : 4;
  const rateRaw = params && params.length > 1 ? Number(params[1]) : 6;
  const waveform = params && params.length > 2 ? String(params[2]).toLowerCase() : 'sine';

  const depth = Number.isFinite(depthRaw) ? Math.max(0, Math.min(15, depthRaw)) : 4;
  const rate = Number.isFinite(rateRaw) ? Math.max(0.1, rateRaw) : 6;

  // Map waveform names to OscillatorNode types
  // Support same waveform aliases as vibrato for consistency
  const waveformMap: Record<string, OscillatorType> = {
    'sine': 'sine',
    'triangle': 'triangle',
    'square': 'square',
    'sawtooth': 'sawtooth',
    'saw': 'sawtooth',
  };
  const oscType: OscillatorType = waveformMap[waveform] || 'sine';

  // Calculate tremolo amplitude as a fraction of the current gain
  // depth 0 = no effect, depth 15 = ±50% gain modulation (0.5 to 1.5x)
  const modulationDepth = (depth / 15) * 0.5; // 0 to 0.5 (±50% max)

  try {
    // Get the current baseline gain (from envelope or default)
    let baselineGain: number;
    try {
      if (typeof gain.gain.getValueAtTime === 'function') {
        baselineGain = gain.gain.getValueAtTime(start);
      } else {
        baselineGain = gain.gain.value || 1.0;
      }
    } catch (e) {
      baselineGain = gain.gain.value || 1.0;
    }
    if (!Number.isFinite(baselineGain) || baselineGain <= 0) baselineGain = 1.0;

    // Create LFO for tremolo
    const lfo = (ctx as any).createOscillator();
    const lfoGain = (ctx as any).createGain();

    lfo.type = oscType;
    try { lfo.frequency.setValueAtTime(rate, start); } catch (_) { lfo.frequency.value = rate; }

    // LFO amplitude = baselineGain * modulationDepth
    // This will modulate the gain between (baseline - amplitude) and (baseline + amplitude)
    const amplitude = baselineGain * modulationDepth;
    try { lfoGain.gain.setValueAtTime(amplitude, start); } catch (_) { lfoGain.gain.value = amplitude; }

    // Connect LFO -> lfoGain -> gain.gain (modulate the volume)
    lfo.connect(lfoGain);
    try {
      lfoGain.connect(gain.gain);
    } catch (e) {
      // Some implementations require different connection approach
      try { (lfoGain as any).connect(gain.gain); } catch (e2) {}
    }

    try { lfo.start(start); } catch (e) { try { lfo.start(); } catch (_) {} }

    // Duration handling: use params[3] if provided (normalized seconds), otherwise use note duration
    const tremDurSec = (Array.isArray(params) && typeof params[3] === 'number') ? Number(params[3]) : undefined;
    const stopAt = (typeof tremDurSec === 'number' && tremDurSec > 0) ? (start + tremDurSec + 0.05) : (start + dur + 0.05);
    try { lfo.stop(stopAt); } catch (e) {}
  } catch (e) {
    // Best-effort only; if the environment doesn't support oscillator-based modulation
    // or connections fail, silently skip tremolo.
  }
});

// Note Cut effect: cuts/gates a note after N ticks
// Parameters:
//  - params[0]: ticks (required, number of ticks after which to cut the note)
//  - params[1]: tickSeconds (optional, injected by caller - seconds per tick)
//
// Cuts notes early by ramping gain to zero. Since oscillator.stop() can only be called
// once and is already scheduled during note creation, we use gain automation to silence
// the note at the cut time.
//
// UGE export: Maps to E0x (cut after x ticks, where x=0-F)
// MIDI export: Documented via text meta event, or emit Note Off earlier than scheduled
register('cut', (ctx: any, nodes: any[], params: any[], start: number, dur: number, chId?: number, tickSeconds?: number) => {
  if (!nodes || nodes.length === 0) return;
  if (!params || params.length === 0) return;

  const ticksRaw = params && params.length > 0 ? Number(params[0]) : undefined;
  if (ticksRaw === undefined || !Number.isFinite(ticksRaw) || ticksRaw <= 0) return;

  const ticks = Math.max(0, ticksRaw);

  // Use provided tickSeconds if available, otherwise estimate from duration
  // Typical default: 16 ticks per beat at 120 BPM = 0.03125s per tick
  const tickDuration = tickSeconds || 0.03125;
  const cutDelay = ticks * tickDuration;

  // Ensure cut time doesn't exceed note duration
  const cutTime = Math.min(start + cutDelay, start + dur);

  // Cut by ramping gain to zero - this works even though oscillator.stop() was already called
  for (const node of nodes) {
    if (!node) continue;
    if (node.gain && typeof node.gain.setValueAtTime === 'function') {
      try {
        // Get current gain value or use default
        let currentGain = 1.0;
        try {
          if (typeof node.gain.getValueAtTime === 'function') {
            currentGain = node.gain.getValueAtTime(cutTime - 0.001) || 1.0;
          } else {
            currentGain = node.gain.value || 1.0;
          }
        } catch (e) {
          currentGain = node.gain.value || 1.0;
        }

        // Cancel any scheduled values after cut time and ramp to zero
        node.gain.cancelScheduledValues(cutTime);
        node.gain.setValueAtTime(currentGain, cutTime);
        node.gain.exponentialRampToValueAtTime(0.0001, cutTime + 0.005);
      } catch (e) {
        // Fallback: try linear ramp
        try {
          node.gain.linearRampToValueAtTime(0, cutTime + 0.005);
        } catch (e2) {}
      }
    }
  }
});
