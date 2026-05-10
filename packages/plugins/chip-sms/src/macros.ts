import {
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
  type ParsedMacro,
  type MacroState,
} from '@beatbax/engine';

/**
 * Software macro engine for the SMS plugin.
 *
 * Implements FamiStudio/FamiTracker-style per-note macros:
 *   vol_env   — volume level (0-15) per frame
 *   arp_env   — arpeggio semitone offset per frame
 *   pitch_env — pitch offset (semitones) per frame
 *   noise_rate_env — noise rate index (0-3) per frame (SMS-specific)
 *
 * Syntax in .bax:
 *   vol_env=[1,2,3,4,5,6,7,8,9,10]        — play once, hold last value
 *   vol_env=[1,2,3,4,5,6,7,8,9,10|9]      — play, loop from index 9 forever
 *   arp_env=[0,4,7|0]                     — C-E-G cycling arpeggio
 *   pitch_env=[0,0,-1,-2,-1,0]            — absolute semitone offset per frame
 *   noise_rate_env=[0,1,2|0]              — noise rate sweep
 *
 * Macros advance once per frame (60 Hz for SMS).
 */

export { parseMacro, advanceMacro, makeMacroState };
export type { ParsedMacro, MacroState };
export const getMacroValue = macroValue;

/**
 * Build a Float32Array gain curve for a vol_env macro, for use with
 * `AudioParam.setValueCurveAtTime` in the Web Audio path.
 *
 * @param macro   Parsed vol_env macro
 * @param mixGain The channel's SMS mix gain multiplier
 * @param dur     Note duration in seconds
 * @param frameRate Frame rate (default 60)
 */
export function buildVolEnvGainCurve(
  macro: ParsedMacro,
  mixGain: number,
  dur: number,
  frameRate = 60
): Float32Array {
  const totalFrames = Math.max(1, Math.ceil(dur * frameRate));
  const state = makeMacroState();
  const vals: number[] = [];

  for (let f = 0; f < totalFrames; f++) {
    // SMS vol_env uses attenuation semantics: 0=loudest, 15=silent.
    // Convert attenuation to gain as (1 - att/15).
    const attenuation = Math.max(0, Math.min(15, getMacroValue(macro, state)));
    vals.push((1 - (attenuation / 15)) * mixGain);
    advanceMacro(macro, state);
  }

  return new Float32Array(vals);
}

/**
 * Schedule Web Audio frequency automation for an arp_env macro.
 * One setValueAtTime per frame, from `start` to `start + dur`.
 *
 * @param freqParam  OscillatorNode.frequency AudioParam
 * @param baseFreq   Base frequency (Hz) of the note
 * @param macro      Parsed arp_env macro (semitone offsets)
 * @param start      AudioContext time of note start
 * @param dur        Note duration in seconds
 * @param frameRate  Frame rate (default 60)
 */
export function scheduleArpEnvToFreq(
  freqParam: any,
  baseFreq: number,
  macro: ParsedMacro,
  start: number,
  dur: number,
  frameRate = 60
): void {
  const frameDur = 1 / frameRate;
  const totalFrames = Math.ceil(dur * frameRate);
  const state = makeMacroState();

  for (let f = 0; f < totalFrames; f++) {
    const semitones = getMacroValue(macro, state);
    const freq = baseFreq * Math.pow(2, semitones / 12);
    try { freqParam.setValueAtTime(freq, start + f * frameDur); } catch (_) {}
    advanceMacro(macro, state);
  }
}

/**
 * Schedule Web Audio frequency automation for a pitch_env macro.
 * Values are absolute semitone offsets from the note root (FamiStudio default).
 */
export function schedulePitchEnvToFreq(
  freqParam: any,
  baseFreq: number,
  macro: ParsedMacro,
  start: number,
  dur: number,
  frameRate = 60
): void {
  const frameDur = 1 / frameRate;
  const totalFrames = Math.ceil(dur * frameRate);
  const state = makeMacroState();

  for (let f = 0; f < totalFrames; f++) {
    const semitones = getMacroValue(macro, state);
    const freq = baseFreq * Math.pow(2, semitones / 12);
    try { freqParam.setValueAtTime(freq, start + f * frameDur); } catch (_) {}
    advanceMacro(macro, state);
  }
}
