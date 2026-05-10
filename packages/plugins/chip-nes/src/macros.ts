import {
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
  type ParsedMacro,
  type MacroState,
} from '@beatbax/engine';

/**
 * Software macro engine for the NES plugin.
 *
 * Implements FamiStudio/FamiTracker-style per-note macros:
 *   vol_env   — volume level  (0-15)  per NES frame
 *   duty_env  — duty cycle    (0-3)   per NES frame (0=12.5%, 1=25%, 2=50%, 3=75%)
 *   arp_env   — arp semitone  (0,n,m) per NES frame; pattern-level arp overrides completely
 *   pitch_env — pitch offset  (semitones, absolute from note root) per NES frame
 *
 * Syntax in .bax:
 *   vol_env=[1,2,3,4,5,6,7,8,9,10]        — play once, hold last value
 *   vol_env=[1,2,3,4,5,6,7,8,9,10|9]      — play, loop from index 9 forever
 *   arp_env=[0,4,7|0]                       — C-E-G cycling arpeggio
 *   pitch_env=[0,0,-1,-2,-1,0]              — absolute semitone offset per frame
 *   duty_env=[0,0,1,1,2,3]                  — duty index sweep (0-3)
 *
 * Macros advance once per NES frame (~60 Hz), matching FamiStudio default behaviour.
 */

export { parseMacro, advanceMacro, makeMacroState };
export type { ParsedMacro, MacroState };
export const getMacroValue = macroValue;

/**
 * Build a Float32Array gain curve for a vol_env macro, for use with
 * `AudioParam.setValueCurveAtTime` in the Web Audio path.
 *
 * @param macro   Parsed vol_env macro
 * @param mixGain The channel's NES mix gain multiplier
 * @param dur     Note duration in seconds
 * @param frameRate NES frame rate (default 60)
 */
export function buildVolEnvGainCurve(
  macro: ParsedMacro,
  mixGain: number,
  dur: number,
  frameRate = 60
): Float32Array {
  const frameDur = 1 / frameRate;
  const totalFrames = Math.max(1, Math.ceil(dur * frameRate));
  const state = makeMacroState();
  const vals: number[] = [];

  for (let f = 0; f < totalFrames; f++) {
    vals.push(getMacroValue(macro, state) * mixGain);
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
 * @param frameRate  NES frame rate (default 60)
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

/** Map duty_env index (0-3) to the DUTY_SEQUENCES key string. */
export const DUTY_ENV_INDEX_TO_KEY = ['12.5', '25', '50', '75'] as const;
