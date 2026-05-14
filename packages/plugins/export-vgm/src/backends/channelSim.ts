/**
 * Chip-agnostic channel simulation primitives for VGM backends.
 *
 * This module contains all chip-independent code that every VGM backend
 * (SMS/SN76489, AY-3-8910, YM2413, …) would otherwise duplicate:
 *
 *  - Pitch utilities (note name → MIDI → Hz)
 *  - Macro system (vol_env, arp_env, pitch_env arrays)
 *  - Base channel simulation state and factory
 *  - Instrument resolution (base + inline instProps merge)
 *  - Generic effect parser (vib, port, arp, volslide, trem, cut, retrig, bend, pitch_env)
 *  - Generic 60 Hz frame advancer (all effects except chip-specific macros)
 *  - Tremolo attenuation helper (handles both SN76489 and AY volume direction)
 *
 * Each chip backend imports from this module and:
 *  1. Extends `BaseChannelSimState` with chip-specific fields.
 *  2. Calls `parseGenericEffectsOnNoteOn` then handles its own effects.
 *  3. Calls `advanceGenericFrames` then advances chip-specific macro state.
 *  4. Provides its own `freqToPeriod` function (formula differs per chip).
 */

import type { InstrumentNode } from '@beatbax/engine';
import {
  NOTE_SEMITONES,
  noteToMidi,
  midiToFreq,
  midiToFreqForNote as engineMidiToFreqForNote,
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
  type ParsedMacro,
  type MacroState,
} from '@beatbax/engine';

export {
  NOTE_SEMITONES,
  noteToMidi,
  midiToFreq,
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
};
export type { ParsedMacro, MacroState };

/**
 * Note name → frequency in Hz.
 * Returns 0 if the note name is unparseable (matches legacy behavior for backends).
 * Delegates to the centralized engine utility.
 */
export function midiToFreqForNote(noteName: string): number {
  return engineMidiToFreqForNote(noteName) ?? 0;
}

// ─── Macro system ─────────────────────────────────────────────────────────────

// ─── Base channel simulation state ────────────────────────────────────────────

/**
 * All chip-agnostic per-channel simulation fields.
 *
 * Chip backends extend this with their own hardware-specific fields.
 * For example, `sn76489.ts` adds `noiseIsWhite`, `noiseRate`, `ggPanBits`, and
 * `noiseRateEnvMacro`; `ay38910.ts` can add `envelopeShape`, `useEnvelope`, etc.
 */
export interface BaseChannelSimState {
  // ── Lifecycle ──────────────────────────────────────────────────────────────
  /** Whether a note is currently playing. */
  active: boolean;
  /** Current frequency in Hz (updated by effects each frame). */
  freq: number;
  /** Base frequency at note-on (arp/pitch macros multiply from this). */
  baseFreq: number;
  /** Base frequency of the previous note (for portamento start). */
  lastNoteFreq: number;
  /** Planned note duration in 60 Hz frames. */
  noteFrames: number;
  /** Elapsed 60 Hz frames since note-on. */
  noteFrame: number;

  // ── Volume ─────────────────────────────────────────────────────────────────
  /**
   * Current channel attenuation (chip-scale: SN76489 uses 0=loudest/15=mute;
   * AY uses 0=mute/15=loudest). The value is written as-is to the chip register.
   */
  attenuation: number;
  /** True when a cut effect has already fired this note. */
  cutDone: boolean;

  // ── Generic macros ─────────────────────────────────────────────────────────
  volEnvMacro:   ParsedMacro | null;
  arpEnvMacro:   ParsedMacro | null;
  pitchEnvMacro: ParsedMacro | null;
  volEnvState:   MacroState;
  arpEnvState:   MacroState;
  pitchEnvState: MacroState;

  // ── Vibrato ────────────────────────────────────────────────────────────────
  vibPhase: number;  // 0..1 LFO phase
  vibDepth: number;  // 0–15 intensity
  vibRate:  number;  // Hz
  vibDelay: number;  // frames before vibrato starts
  vibFrame: number;  // frames elapsed since note-on

  // ── Portamento ─────────────────────────────────────────────────────────────
  portTarget:   number;
  portStart:    number;
  portFrame:    number;
  portDuration: number;
  portActive:   boolean;

  // ── Tremolo ────────────────────────────────────────────────────────────────
  tremoloPhase:    number;
  tremoloDepth:    number;
  tremoloRate:     number;
  tremoloDelay:    number;   // frames before tremolo starts
  tremoloDuration: number;   // frames tremolo stays active; -1 = full note
  tremoloFrame:    number;   // elapsed frames since note-on

  // ── Cut / retrig ───────────────────────────────────────────────────────────
  cutTick:        number;  // tick within note at which to cut; -1 = no cut
  retrigInterval: number;  // ticks between retriggers; 0 = disabled
  retrigTick:     number;  // tick counter within note

  // ── Bend ───────────────────────────────────────────────────────────────────
  bendStart:     number;  // starting frequency at bend start
  bendSemitones: number;  // total semitone offset
  bendCurve:     string;  // linear|exp|log|sine
  bendDelay:     number;  // delay before bend starts (frames)
  bendFrame:     number;  // elapsed bend frames (including delay)
  bendDuration:  number;  // bend duration in frames
  bendActive:    boolean;

  // ── Volume slide ───────────────────────────────────────────────────────────
  volSlideDelta: number;  // signed slide amount
  volSlideSteps: number;  // optional stepped mode count (0 = smooth)
}

/**
 * Create a fresh `BaseChannelSimState` with all fields zeroed / inactive.
 *
 * @param mutedAttenuation - The chip-scale mute value (15 for SN76489, 0 for AY).
 */
export function makeBaseChannelState(mutedAttenuation: number): BaseChannelSimState {
  return {
    active: false,
    freq: 0,
    baseFreq: 0,
    lastNoteFreq: 0,
    noteFrames: 1,
    noteFrame: 0,
    attenuation: mutedAttenuation,
    cutDone: false,
    volEnvMacro: null,
    arpEnvMacro: null,
    pitchEnvMacro: null,
    volEnvState: makeMacroState(),
    arpEnvState: makeMacroState(),
    pitchEnvState: makeMacroState(),
    vibPhase: 0, vibDepth: 0, vibRate: 0, vibDelay: 0, vibFrame: 0,
    portTarget: 0, portStart: 0, portFrame: 0, portDuration: 0, portActive: false,
    tremoloPhase: 0, tremoloDepth: 0, tremoloRate: 0, tremoloDelay: 0, tremoloDuration: -1, tremoloFrame: 0,
    cutTick: -1,
    retrigInterval: 0, retrigTick: 0,
    bendStart: 0, bendSemitones: 0, bendCurve: 'linear', bendDelay: 0, bendFrame: 0, bendDuration: 0, bendActive: false,
    volSlideDelta: 0, volSlideSteps: 0,
  };
}

// ─── Instrument resolution ────────────────────────────────────────────────────

/**
 * Resolve an instrument from the song's instrument map.
 * When the event carries inline `instProps`, they are shallow-merged on top of
 * the base instrument so per-note overrides work without mutating the map.
 */
export function resolveInstrument(
  event: { instrument?: string; instProps?: Record<string, unknown> },
  insts: Record<string, InstrumentNode>,
  channelDefault: string | undefined,
): InstrumentNode | null {
  const name = event.instrument ?? channelDefault;
  if (!name) return null;
  const base = insts[name] ?? null;
  if (!base) return null;
  if (event.instProps && Object.keys(event.instProps).length > 0) {
    return { ...base, ...event.instProps } as InstrumentNode;
  }
  return base;
}

// ─── Generic effect parsing ───────────────────────────────────────────────────

export interface Effect {
  type: string;
  params: Array<string | number>;
  /** Resolver-provided delay in seconds (preferred over raw param rows). */
  delaySec?: number;
  /** Resolver-provided duration in seconds. */
  durationSec?: number;
}

/**
 * Parse all chip-agnostic effects from an ISM note-on event into `state`.
 *
 * Handles: `vib`, `port`/`portamento`, `arp`, `volslide`, `trem`/`tremolo`,
 * `cut`, `retrig`, `bend`, `pitch_env`.
 *
 * Does **not** handle chip-specific effects such as `noise_rate_env` (SMS) or
 * AY envelope effects. Each backend calls this first and then processes its own
 * chip-specific effects in a second pass.
 *
 * @param _noteName - The triggering note name, reserved for future chip-specific
 *                    override hooks (e.g. AY sample triggers keyed to note name).
 */
export function parseGenericEffectsOnNoteOn(
  effects: Effect[],
  state: BaseChannelSimState,
  _noteName: string,
  tickSeconds: number,
  framesPerTick: number,
): void {
  for (const eff of effects) {
    const t = eff.type.toLowerCase();
    const p = eff.params;

    if (t === 'vib') {
      state.vibDepth = typeof p[0] === 'number' ? p[0] : parseFloat(String(p[0]));
      state.vibRate  = typeof p[1] === 'number' ? p[1] : parseFloat(String(p[1]));
      if (isNaN(state.vibDepth)) state.vibDepth = 1;
      if (isNaN(state.vibRate))  state.vibRate  = 5;
      state.vibPhase = 0;
      const delaySec = typeof eff.delaySec === 'number' ? eff.delaySec : null;
      if (delaySec !== null && delaySec > 0) {
        state.vibDelay = Math.round(delaySec * 60);
      } else {
        const rawDelayRows = p[4] !== undefined ? Number(p[4]) : 0;
        state.vibDelay = isNaN(rawDelayRows) ? 0 : Math.round(rawDelayRows * 60 * tickSeconds);
      }

    } else if (t === 'port' || t === 'portamento') {
      let speed = 16;
      let targetFreq = state.baseFreq;
      if (typeof p[0] === 'number' || (typeof p[0] === 'string' && Number.isFinite(Number(p[0])))) {
        speed = Number(p[0]);
        targetFreq = state.baseFreq;
      } else {
        const targetNote = typeof p[0] === 'string' ? p[0] : String(p[0]);
        const midi = noteToMidi(targetNote);
        targetFreq = midi !== null ? midiToFreq(midi) : state.baseFreq;
        speed = Number(p[1] ?? 16);
      }

      if (!Number.isFinite(speed)) speed = 16;
      speed = Math.max(1, Math.min(255, speed));

      const startFreq = state.lastNoteFreq > 0 ? state.lastNoteFreq : state.baseFreq;
      let portFrames = Math.max(1, Math.round(((256 - speed) / 256) * state.noteFrames * 0.6));
      const durationRows = Number(p[1]);
      if (Number.isFinite(durationRows) && durationRows > 0) {
        portFrames = Math.max(1, Math.round(durationRows * framesPerTick));
      }
      if (eff.durationSec && Number.isFinite(eff.durationSec)) {
        portFrames = Math.max(1, Math.round(eff.durationSec * 60));
      }

      state.portStart = startFreq;
      state.portTarget = targetFreq;
      state.portFrame = 0;
      state.portDuration = portFrames;
      state.portActive = state.portTarget > 0 && Math.abs(state.portTarget - state.portStart) > 0.5;
      if (state.portActive) {
        state.freq = state.portStart;
      }

    } else if (t === 'arp') {
      if (p.length > 0) {
        const values = p.map(v => Number(v)).filter(Number.isFinite);
        if (values.length > 0) {
          state.arpEnvMacro = { values, loopPoint: 0 };
          state.arpEnvState = makeMacroState();
        }
      }

    } else if (t === 'volslide') {
      const delta = Number(p[0]);
      if (Number.isFinite(delta) && delta !== 0) {
        state.volSlideDelta = delta;
      }
      const steps = Number(p[1]);
      if (Number.isFinite(steps) && steps > 0) {
        state.volSlideSteps = Math.max(1, Math.round(steps));
      }

    } else if (t === 'trem' || t === 'tremolo') {
      state.tremoloDepth = typeof p[0] === 'number' ? p[0] : parseFloat(String(p[0]));
      state.tremoloRate  = typeof p[1] === 'number' ? p[1] : parseFloat(String(p[1] ?? '5'));
      if (isNaN(state.tremoloDepth)) state.tremoloDepth = 2;
      if (isNaN(state.tremoloRate))  state.tremoloRate  = 5;
      state.tremoloPhase = 0;
      state.tremoloFrame = 0;

      let tremDurationFrames = -1;
      if (typeof eff.durationSec === 'number' && eff.durationSec > 0) {
        tremDurationFrames = Math.max(1, Math.round(eff.durationSec * 60));
      } else {
        const durationRows = p[3] !== undefined ? Number(p[3]) : 0;
        if (Number.isFinite(durationRows) && durationRows > 0) {
          tremDurationFrames = Math.max(1, Math.round(durationRows * framesPerTick));
        }
      }
      state.tremoloDuration = tremDurationFrames;

      let tremDelayFrames = 0;
      if (typeof eff.delaySec === 'number' && eff.delaySec > 0) {
        tremDelayFrames = Math.max(0, Math.round(eff.delaySec * 60));
      } else {
        const delayRows = p[4] !== undefined ? Number(p[4]) : 0;
        if (Number.isFinite(delayRows) && delayRows > 0) {
          tremDelayFrames = Math.max(0, Math.round(delayRows * framesPerTick));
        }
      }
      state.tremoloDelay = tremDelayFrames;

    } else if (t === 'cut') {
      const tick = typeof p[0] === 'number' ? p[0] : parseInt(String(p[0]), 10);
      state.cutTick = isNaN(tick) ? -1 : tick;

    } else if (t === 'retrig') {
      const interval = typeof p[0] === 'number' ? p[0] : parseInt(String(p[0]), 10);
      state.retrigInterval = isNaN(interval) ? 0 : Math.max(1, interval);

    } else if (t === 'bend') {
      let semitones = Number.NaN;
      if (typeof p[0] === 'number' || (typeof p[0] === 'string' && Number.isFinite(Number(p[0])))) {
        semitones = Number(p[0]);
      } else {
        const targetNote = typeof p[0] === 'string' ? p[0] : String(p[0]);
        const midi = noteToMidi(targetNote);
        if (midi !== null && state.baseFreq > 0) {
          const targetFreq = midiToFreq(midi);
          semitones = 12 * Math.log2(targetFreq / state.baseFreq);
        }
      }

      if (Number.isFinite(semitones) && semitones !== 0) {
        state.bendStart = state.freq > 0 ? state.freq : state.baseFreq;
        state.bendSemitones = semitones;
        state.bendCurve = typeof p[1] !== 'undefined' ? String(p[1]).toLowerCase() : 'linear';

        const noteSec = Math.max(0.001, state.noteFrames / 60);
        let delaySec = typeof p[2] !== 'undefined' ? Number(p[2]) : (noteSec * 0.5);
        if (!Number.isFinite(delaySec) || delaySec < 0) delaySec = noteSec * 0.5;
        delaySec = Math.min(delaySec, noteSec);

        let bendSec = typeof p[3] !== 'undefined' ? Number(p[3]) : (noteSec - delaySec);
        if (!Number.isFinite(bendSec) || bendSec <= 0) bendSec = noteSec - delaySec;
        bendSec = Math.max(0.001, Math.min(bendSec, Math.max(0.001, noteSec - delaySec)));

        state.bendDelay = Math.max(0, Math.round(delaySec * 60));
        state.bendDuration = Math.max(1, Math.round(bendSec * 60));
        state.bendFrame = 0;
        state.bendActive = true;
      }

    } else if (t === 'pitch_env') {
      if (p.length > 0) {
        const macro = parseMacro(p[0]);
        if (macro) {
          state.pitchEnvMacro = macro;
          state.pitchEnvState = makeMacroState();
        }
      }
    }
  }
}

// ─── Generic frame advancement (60 Hz) ───────────────────────────────────────

/**
 * Advance the chip-agnostic effects simulation by `frames` 60 Hz frames.
 *
 * Processes: `vol_env`, `arp_env`, `pitch_env`, vibrato, tremolo, volslide,
 * portamento, and bend.
 *
 * Does **not** process chip-specific macros (e.g. SMS `noiseRateEnvMacro` or
 * AY envelope counter). Backends call this first and then advance their own
 * chip-specific state.
 *
 * @returns `{ periodChanged, volumeChanged }` — true when the corresponding
 *          hardware register needs updating after this call.
 */
export function advanceGenericFrames(
  state: BaseChannelSimState,
  frames: number,
): { periodChanged: boolean; volumeChanged: boolean } {
  if (!state.active || frames <= 0) {
    return { periodChanged: false, volumeChanged: false };
  }

  let periodChanged = false;
  let volumeChanged = false;

  for (let f = 0; f < frames; f++) {
    // ── vol_env ───────────────────────────────────────────────────────────────
    if (state.volEnvMacro) {
      const v = Math.max(0, Math.min(15, Math.round(macroValue(state.volEnvMacro, state.volEnvState))));
      if (v !== state.attenuation) { state.attenuation = v; volumeChanged = true; }
      advanceMacro(state.volEnvMacro, state.volEnvState);
    }

    // ── arp_env ───────────────────────────────────────────────────────────────
    if (state.arpEnvMacro) {
      const semi = macroValue(state.arpEnvMacro, state.arpEnvState);
      const newFreq = state.baseFreq * Math.pow(2, semi / 12);
      if (Math.abs(newFreq - state.freq) > 0.5) { state.freq = newFreq; periodChanged = true; }
      advanceMacro(state.arpEnvMacro, state.arpEnvState);
    }

    // ── pitch_env ─────────────────────────────────────────────────────────────
    if (state.pitchEnvMacro) {
      const semi = macroValue(state.pitchEnvMacro, state.pitchEnvState);
      const newFreq = state.baseFreq * Math.pow(2, semi / 12);
      if (Math.abs(newFreq - state.freq) > 0.5) { state.freq = newFreq; periodChanged = true; }
      advanceMacro(state.pitchEnvMacro, state.pitchEnvState);
    }

    // ── vibrato LFO ───────────────────────────────────────────────────────────
    state.vibFrame++;
    if (state.vibDepth > 0 && state.vibRate > 0 && state.vibFrame > state.vibDelay) {
      const phase = (state.vibFrame - state.vibDelay) * state.vibRate / 60;
      const sinVal = Math.sin(2 * Math.PI * phase);
      // Tracker-style depth: amplitudeHz = depth * f² / 131072
      const amplitudeHz = state.vibDepth * state.baseFreq * state.baseFreq / 131072;
      const newFreq = state.baseFreq + sinVal * amplitudeHz;
      if (Math.abs(newFreq - state.freq) > 0.5) { state.freq = newFreq; periodChanged = true; }
    }

    // ── tremolo LFO phase advance ─────────────────────────────────────────────
    if (state.tremoloDepth > 0 && state.tremoloRate > 0) {
      const activeStart = state.tremoloDelay;
      const activeEnd = state.tremoloDuration >= 0
        ? (state.tremoloDelay + state.tremoloDuration)
        : Number.POSITIVE_INFINITY;
      const tremActiveNow = state.tremoloFrame >= activeStart && state.tremoloFrame < activeEnd;
      if (tremActiveNow) {
        state.tremoloPhase += state.tremoloRate / 60;
        if (state.tremoloPhase > 1) state.tremoloPhase -= Math.floor(state.tremoloPhase);
        volumeChanged = true;
      }
      state.tremoloFrame++;
    }

    // ── volume slide ──────────────────────────────────────────────────────────
    if (state.volSlideDelta !== 0) {
      const currentGain = Math.max(0, Math.min(1, 1 - (state.attenuation / 15)));
      const progress = state.noteFrames > 0 ? Math.min(1, state.noteFrame / state.noteFrames) : 1;
      const stepProgress = state.volSlideSteps > 0
        ? Math.min(1, Math.floor(progress * state.volSlideSteps) / state.volSlideSteps)
        : progress;
      const gainDelta = (state.volSlideDelta * stepProgress) / 5;
      const slidGain = Math.max(0, Math.min(1.5, currentGain + gainDelta));
      const att = Math.max(0, Math.min(15, Math.round((1 - Math.min(1, slidGain)) * 15)));
      if (att !== state.attenuation) {
        state.attenuation = att;
        volumeChanged = true;
      }
    }

    // ── portamento ────────────────────────────────────────────────────────────
    if (state.portActive && state.portTarget > 0) {
      const progress = Math.min(1, state.portFrame / Math.max(1, state.portDuration));
      const eased = progress * progress * (3 - 2 * progress);
      const newFreq = state.portStart + (state.portTarget - state.portStart) * eased;
      if (Math.abs(newFreq - state.freq) > 0.5) {
        state.freq = newFreq;
        periodChanged = true;
      }
      state.portFrame++;
      if (progress >= 1) {
        state.freq = state.portTarget;
        state.portActive = false;
      }
    }

    // ── bend ──────────────────────────────────────────────────────────────────
    if (state.bendActive && state.bendDuration > 0) {
      const bf = state.bendFrame;
      if (bf >= state.bendDelay) {
        const raw = (bf - state.bendDelay) / Math.max(1, state.bendDuration);
        const bendProgress = Math.max(0, Math.min(1, raw));
        let shapedProgress = bendProgress;
        if (state.bendCurve === 'exp' || state.bendCurve === 'exponential') {
          shapedProgress = bendProgress * bendProgress;
        } else if (state.bendCurve === 'log' || state.bendCurve === 'logarithmic') {
          shapedProgress = 1 - Math.pow(1 - bendProgress, 2);
        } else if (state.bendCurve === 'sine' || state.bendCurve === 'sin') {
          shapedProgress = (1 - Math.cos(Math.PI * bendProgress)) / 2;
        }
        const newFreq = state.bendStart * Math.pow(2, (state.bendSemitones * shapedProgress) / 12);
        if (Math.abs(newFreq - state.freq) > 0.5) {
          state.freq = newFreq;
          periodChanged = true;
        }
        if (bendProgress >= 1) {
          state.bendActive = false;
        }
      }
      state.bendFrame++;
    }

    state.noteFrame++;
  }

  return { periodChanged, volumeChanged };
}

// ─── Tremolo attenuation helper ───────────────────────────────────────────────

/**
 * Apply tremolo modulation to `baseAttenuation` and return the effective value.
 *
 * @param state           - The channel simulation state.
 * @param baseAttenuation - The attenuation value before tremolo is applied.
 * @param invertScale     - When `true`, volume scale is inverted (AY: 0=mute, 15=loudest).
 *                          When `false`, SN76489 scale (0=loudest, 15=mute).
 *
 * Tremolo modulation depth: depth(0..15) maps to gain-domain depth 0..0.5.
 */
export function calcTremoloAttenuation(
  state: BaseChannelSimState,
  baseAttenuation: number,
  invertScale: boolean,
): number {
  if (state.tremoloDepth <= 0 || state.tremoloRate <= 0) return baseAttenuation;

  const activeStart = state.tremoloDelay;
  const activeEnd = state.tremoloDuration >= 0
    ? (state.tremoloDelay + state.tremoloDuration)
    : Number.POSITIVE_INFINITY;
  const tremActiveNow = state.tremoloFrame >= activeStart && state.tremoloFrame < activeEnd;
  if (!tremActiveNow) return baseAttenuation;

  const modulationDepth = (Math.max(0, Math.min(15, state.tremoloDepth)) / 15) * 0.5;
  const lfo = Math.sin(2 * Math.PI * state.tremoloPhase);
  const tremGain = 1.0 + (lfo * modulationDepth);

  if (invertScale) {
    // AY: 0=mute, 15=loudest → gain domain uses direct mapping
    const baselineGain = Math.max(0, Math.min(1, baseAttenuation / 15));
    const effectiveGain = Math.max(0, Math.min(1, baselineGain * tremGain));
    return Math.max(0, Math.min(15, Math.round(effectiveGain * 15)));
  } else {
    // SN76489: 0=loudest, 15=mute → invert before multiplying gain, then back
    const baselineGain = Math.max(0, Math.min(1, 1 - (baseAttenuation / 15)));
    const effectiveGain = Math.max(0, Math.min(1, baselineGain * tremGain));
    return Math.max(0, Math.min(15, Math.round((1 - effectiveGain) * 15)));
  }
}
