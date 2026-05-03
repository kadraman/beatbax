/**
 * ISM → VGM translation for the SN76489 PSG (Sega Master System / Game Gear).
 *
 * Walks the ISM event stream tick-by-tick, simulates the SMS chip behaviour
 * (macros, effects) per-tick, and emits the corresponding PSG register writes
 * and wait commands into a VGM data buffer.
 *
 * Timing model (matches pcmRenderer.ts):
 *   tickSeconds = (60 / bpm) / 4
 *   samplesPerTick = 44100 * tickSeconds
 *   framesPerTick  = 60 * tickSeconds   (60 Hz macro advance rate)
 */

import type { InstrumentNode } from '@beatbax/engine';

// ─── Local song model types (SongModel is not re-exported by the engine's plugin API) ──

export interface ChannelEventLike {
  type: string;
  token?: string;
  instrument?: string;
  instProps?: Record<string, any>;
  effects?: Array<{ type: string; params: Array<string | number> }>;
  defaultNote?: string;
  pan?: { enum?: string; value?: number; sourceNamespace?: string } | null;
}

export interface ChannelModelLike {
  id: number;
  events: ChannelEventLike[];
  defaultInstrument?: string;
  speed?: number;
}

export interface SongLike {
  pats: Record<string, string[]>;
  insts: Record<string, InstrumentNode>;
  seqs: Record<string, string[]>;
  channels: ChannelModelLike[];
  bpm?: number;
  chip?: string;
  chipRegion?: string;
  volume?: number;
  metadata?: {
    name?: string;
    artist?: string;
    description?: string;
    tags?: string[];
  };
}
import { SN76489State, GG_STEREO_DEFAULT, ATTENUATION_MUTE } from './psgState.js';
import { appendWait } from './vgmWriter.js';
import {
  CMD_PSG_WRITE,
  CMD_GG_STEREO,
  SN76489_CLOCK_NTSC,
  SN76489_CLOCK_PAL,
  noiseControlByte,
  SAMPLES_PER_60HZ,
} from './constants.js';

// ─── Pitch utilities ──────────────────────────────────────────────────────────

/** Semitone offsets for note names (A=9, B=11, C=0, …) */
const NOTE_SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3,
  E: 4, F: 5, 'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8,
  A: 9, 'A#': 10, BB: 10, B: 11,
};

/** Parse a note name (e.g. "C4", "F#5", "Bb3") into a MIDI note number. */
function noteToMidi(note: string): number | null {
  const m = note.match(/^([A-Ga-g])([#bB]?)(-?\d+)$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2] === 'b' || m[2] === 'B' ? 'B' : m[2] === '#' ? '#' : '';
  const octave = parseInt(m[3], 10);
  const key = letter + (acc ? acc : '');
  const semi = NOTE_SEMITONES[key];
  if (semi === undefined) return null;
  return (octave + 1) * 12 + semi;
}

/** MIDI note number → frequency in Hz (equal temperament, A4 = 440 Hz). */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Frequency → 10-bit SN76489 period register value. */
function freqToPeriod(freq: number, clock: number): number {
  if (freq <= 0) return 0;
  return Math.max(0, Math.min(1023, Math.round(clock / (32 * freq))));
}

/** Note name → SN76489 period (0 if unparseable). Used by SMF-level utilities. */
export function noteToPeriod(note: string, clock: number): number {
  const midi = noteToMidi(note);
  if (midi === null) return 0;
  return freqToPeriod(midiToFreq(midi), clock);
}

/** MIDI note number → frequency (for effect calculations). */
function midiToFreqForNote(noteName: string): number {
  const midi = noteToMidi(noteName);
  return midi !== null ? midiToFreq(midi) : 0;
}

// ─── GG stereo ────────────────────────────────────────────────────────────────

/** GG pan value → 2-bit mask (bit0=left, bit1=right). */
function panToBits(pan: string): number {
  const p = pan.toUpperCase();
  if (p === 'L' || p === 'LEFT')  return 0b01;
  if (p === 'R' || p === 'RIGHT') return 0b10;
  return 0b11; // C / center / default
}

/** Numeric pan (-1..+1) → 2-bit GG mask (snap to L/C/R). */
function numericPanToBits(value: number): number {
  if (value < -0.33) return 0b01; // L
  if (value >  0.33) return 0b10; // R
  return 0b11;                    // C
}

/**
 * Build the 8-bit GG stereo register from per-channel pan settings.
 * Channels are indexed 0-3 (Tone1, Tone2, Tone3, Noise).
 * Bits: [N7 N6 | T5 T4 | T3 T2 | T1 T0]
 *        ch3   |  ch2  |  ch1  |  ch0
 * Each pair: bit0=left, bit1=right
 */
function buildGgStereoByte(pans: number[]): number {
  let byte = 0;
  for (let ch = 0; ch < 4 && ch < pans.length; ch++) {
    byte |= (pans[ch] & 0b11) << (ch * 2);
  }
  return byte;
}

// ─── Macro state ─────────────────────────────────────────────────────────────

interface MacroState {
  index: number;
  done: boolean;
}

interface ParsedMacro {
  values: number[];
  loopPoint: number; // -1 = no loop
}

function parseMacro(raw: any): ParsedMacro | null {
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) {
    const vals = raw.map(Number).filter(Number.isFinite);
    return vals.length > 0 ? { values: vals, loopPoint: -1 } : null;
  }
  let str = String(raw).trim();
  if (!str.startsWith('[')) return null;
  if (str.endsWith(']')) str = str.slice(1, -1);
  else str = str.slice(1);
  let loopPoint = -1;
  const pipeIdx = str.lastIndexOf('|');
  if (pipeIdx >= 0) {
    loopPoint = parseInt(str.slice(pipeIdx + 1), 10);
    if (isNaN(loopPoint) || loopPoint < 0) loopPoint = -1;
    str = str.slice(0, pipeIdx);
  }
  const values = str.split(',').map(s => parseFloat(s.trim())).filter(Number.isFinite);
  if (values.length === 0) return null;
  if (loopPoint >= values.length) loopPoint = values.length - 1;
  return { values, loopPoint };
}

function macroValue(macro: ParsedMacro, state: MacroState): number {
  if (state.done) return macro.values[macro.values.length - 1];
  return macro.values[Math.min(state.index, macro.values.length - 1)];
}

function advanceMacro(macro: ParsedMacro, state: MacroState): void {
  if (state.done) return;
  state.index++;
  if (state.index >= macro.values.length) {
    if (macro.loopPoint >= 0) {
      state.index = macro.loopPoint;
    } else {
      state.index = macro.values.length - 1;
      state.done = true;
    }
  }
}

function makeMacroState(): MacroState {
  return { index: 0, done: false };
}

// ─── Per-channel simulation state ────────────────────────────────────────────

interface ChannelSimState {
  /** Whether a note is currently playing. */
  active: boolean;
  /** Current frequency in Hz (used for effect calculations). */
  freq: number;
  /** Base frequency at note-on (for arp/pitch macros). */
  baseFreq: number;
  /** Current PSG channel attenuation (0=loudest, 15=mute). */
  attenuation: number;
  /** Current noise mode: true=white, false=periodic. */
  noiseIsWhite: boolean;
  /** Current noise rate 0-3. */
  noiseRate: number;
  /** Per-channel GG pan bits (2-bit mask). */
  ggPanBits: number;

  // Macros
  volEnvMacro:       ParsedMacro | null;
  arpEnvMacro:       ParsedMacro | null;
  pitchEnvMacro:     ParsedMacro | null;
  noiseRateEnvMacro: ParsedMacro | null;
  volEnvState:       MacroState;
  arpEnvState:       MacroState;
  pitchEnvState:     MacroState;
  noiseRateEnvState: MacroState;

  // Active effects
  vibPhase:     number;  // 0..1 LFO phase
  vibDepth:     number;  // semitones
  vibRate:      number;  // Hz
  vibDelay:     number;  // frames before vibrato starts
  vibFrame:     number;  // frames elapsed since note-on

  portTarget:   number;  // target frequency
  portRate:     number;  // semitones per tick
  portActive:   boolean;

  tremoloPhase: number;
  tremoloDepth: number;
  tremoloRate:  number;

  cutTick:      number;  // tick within note at which to cut; -1 = no cut
  cutDone:      boolean;

  retrigInterval: number; // ticks between retriggers; 0 = disabled
  retrigTick:     number; // tick counter within note

  bendTarget:   number;  // target freq for bend
  bendRate:     number;  // semitones per tick
  bendActive:   boolean;
}

function makeChannelState(): ChannelSimState {
  return {
    active: false,
    freq: 0,
    baseFreq: 0,
    attenuation: ATTENUATION_MUTE,
    noiseIsWhite: true,
    noiseRate: 2,
    ggPanBits: 0b11, // C (both sides)
    volEnvMacro: null,
    arpEnvMacro: null,
    pitchEnvMacro: null,
    noiseRateEnvMacro: null,
    volEnvState: makeMacroState(),
    arpEnvState: makeMacroState(),
    pitchEnvState: makeMacroState(),
    noiseRateEnvState: makeMacroState(),
    vibPhase: 0, vibDepth: 0, vibRate: 0, vibDelay: 0, vibFrame: 0,
    portTarget: 0, portRate: 0, portActive: false,
    tremoloPhase: 0, tremoloDepth: 0, tremoloRate: 0,
    cutTick: -1, cutDone: false,
    retrigInterval: 0, retrigTick: 0,
    bendTarget: 0, bendRate: 0, bendActive: false,
  };
}
function channelIdToPsg(channelId: number): number {
  return channelId - 1; // channel 1 → PSG 0, channel 4 → PSG 3
}

/** True when the PSG channel is the noise channel (index 3). */
function isNoiseChannel(psgCh: number): boolean {
  return psgCh === 3;
}

// ─── Instrument extraction ────────────────────────────────────────────────────

function resolveInstrument(
  event: ChannelEventLike,
  insts: Record<string, InstrumentNode>,
  channelDefault: string | undefined,
): InstrumentNode | null {
  const name = event.instrument ?? channelDefault;
  if (!name) return null;
  const base = insts[name] ?? null;
  if (!base) return null;
  if (event.instProps && Object.keys(event.instProps).length > 0) {
    return { ...base, ...event.instProps };
  }
  return base;
}

/** Read the `gg:pan` (or `gg_pan`) from an instrument node. */
function readGgPan(inst: InstrumentNode | null): number | null {
  if (!inst) return null;
  const ggPanVal = (inst as any)['gg:pan'] ?? (inst as any)['gg_pan'];
  if (ggPanVal !== undefined && ggPanVal !== null) {
    return panToBits(String(ggPanVal));
  }
  return null;
}

/** Snap a generic `pan` value (numeric or string) to GG bits. */
function readGenericPan(inst: InstrumentNode | null, eventPan: any): number | null {
  if (eventPan && typeof eventPan === 'object') {
    if (eventPan.enum) return panToBits(String(eventPan.enum));
    if (typeof eventPan.value === 'number') return numericPanToBits(eventPan.value);
  }
  const ggPan = readGgPan(inst);
  if (ggPan !== null) return ggPan;
  return null;
}

// ─── Note-on: parse instrument, apply initial state ──────────────────────────

function noteOn(
  state: ChannelSimState,
  noteName: string,
  inst: InstrumentNode | null,
  psgCh: number,
  clock: number,
): void {
  state.active = true;
  state.cutDone = false;
  state.vibFrame = 0;
  state.retrigTick = 0;

  // Frequency and period
  const freq = midiToFreqForNote(noteName);
  state.freq = freq;
  state.baseFreq = freq;

  // Volume / attenuation - use true SMS attenuation semantics (0=loudest, 15=mute)
  if (inst) {
    // Default to medium volume if no volume specified
    const defaultVolume = 8;
    let baseVolume;
    if (inst.vol !== undefined) {
      baseVolume = Number(inst.vol);
    } else {
      baseVolume = defaultVolume;
    }
    // Use instrument volume directly (no post-export gain boost)
    state.attenuation = Math.max(0, Math.min(15, baseVolume));

    // Noise settings (channel 3 only)
    if (isNoiseChannel(psgCh) && inst) {
      const mode = String(inst.noise_mode ?? 'white').toLowerCase();
      state.noiseIsWhite = mode !== 'periodic';
      const rawRate = inst.noise_rate !== undefined ? inst.noise_rate : 2;
      if (typeof rawRate === 'string' && rawRate.toLowerCase() === 'tone3') {
        state.noiseRate = 3;
      } else {
        state.noiseRate = Math.max(0, Math.min(3, Math.round(Number(rawRate))));
      }
    }

    // Process vol_env macros for all channels
    const volEnvM = parseMacro(inst.vol_env);
    state.volEnvMacro = volEnvM;
    state.volEnvState = makeMacroState();
    if (volEnvM && volEnvM.values.length > 0) {
      const vol = Math.max(0, Math.min(15, volEnvM.values[0]));
      state.attenuation = vol;
    }

    if (!isNoiseChannel(psgCh)) {
      state.arpEnvMacro = parseMacro(inst.arp_env);
      state.arpEnvState = makeMacroState();
      state.pitchEnvMacro = parseMacro(inst.pitch_env);
      state.pitchEnvState = makeMacroState();
    } else {
      state.arpEnvMacro = null;
      state.pitchEnvMacro = null;
      state.noiseRateEnvMacro = parseMacro((inst as any).noise_rate_env);
      state.noiseRateEnvState = makeMacroState();
    }
  } else {
    state.volEnvMacro = null;
    state.arpEnvMacro = null;
    state.pitchEnvMacro = null;
    state.noiseRateEnvMacro = null;
  }

  // Reset effect state
  state.vibPhase = 0;
  state.vibDepth = 0;
  state.vibRate = 0;
  state.vibDelay = 0;
  state.portActive = false;
  state.tremoloPhase = 0;
  state.tremoloDepth = 0;
  state.tremoloRate = 0;
  state.cutTick = -1;
  state.retrigInterval = 0;
  state.bendActive = false;
}

// ─── Effect parsing ───────────────────────────────────────────────────────────

interface Effect {
  type: string;
  params: Array<string | number>;
}

function parseEffectsOnNoteOn(
  effects: Effect[],
  state: ChannelSimState,
  noteName: string,
  _clock: number,
  _tickSeconds: number,
): void {
  for (const eff of effects) {
    const t = eff.type.toLowerCase();
    const p = eff.params;
    if (t === 'vib') {
      // vib:depth,rate[,wave,delay,speed]
      state.vibDepth = typeof p[0] === 'number' ? p[0] : parseFloat(String(p[0]));
      state.vibRate  = typeof p[1] === 'number' ? p[1] : parseFloat(String(p[1]));
      if (isNaN(state.vibDepth)) state.vibDepth = 1;
      if (isNaN(state.vibRate))  state.vibRate  = 5;
      state.vibPhase = 0;
      // delay is param[3] in ticks (0-indexed)
      const rawDelay = p[3] !== undefined ? Number(p[3]) : 0;
      state.vibDelay = isNaN(rawDelay) ? 0 : Math.round(rawDelay);
    } else if (t === 'port' || t === 'portamento') {
      // port:target[,rate]
      const targetNote = typeof p[0] === 'string' ? p[0] : String(p[0]);
      const midi = noteToMidi(targetNote);
      state.portTarget = midi !== null ? midiToFreq(midi) : 0;
      state.portRate   = typeof p[1] === 'number' ? p[1] : parseFloat(String(p[1] ?? '2'));
      if (isNaN(state.portRate)) state.portRate = 2;
      state.portActive = state.portTarget > 0;
    } else if (t === 'arp') {
      // arp:semitone1,semitone2[,...] - treat as arp_env looping macro
      if (p.length > 0) {
        const values = p.map(v => Number(v)).filter(Number.isFinite);
        if (values.length > 0) {
          state.arpEnvMacro = { values, loopPoint: 0 };
          state.arpEnvState = makeMacroState();
        }
      }
    } else if (t === 'volslide') {
      // volSlide:rate — positive = fade out (attenuation increases), negative = fade in
      // rate is change per 60Hz frame; we'll apply per-frame
      // Store in tremoloDepth (reuse field), tremoloRate for rate direction
      // Actually handle in per-tick effect application
    } else if (t === 'trem' || t === 'tremolo') {
      // trem:depth,rate
      state.tremoloDepth = typeof p[0] === 'number' ? p[0] : parseFloat(String(p[0]));
      state.tremoloRate  = typeof p[1] === 'number' ? p[1] : parseFloat(String(p[1] ?? '5'));
      if (isNaN(state.tremoloDepth)) state.tremoloDepth = 2;
      if (isNaN(state.tremoloRate))  state.tremoloRate  = 5;
      state.tremoloPhase = 0;
    } else if (t === 'cut') {
      // cut:N — mute at tick N within the note
      const tick = typeof p[0] === 'number' ? p[0] : parseInt(String(p[0]), 10);
      state.cutTick = isNaN(tick) ? -1 : tick;
    } else if (t === 'retrig') {
      // retrig:interval — re-trigger every N ticks
      const interval = typeof p[0] === 'number' ? p[0] : parseInt(String(p[0]), 10);
      state.retrigInterval = isNaN(interval) ? 0 : Math.max(1, interval);
    } else if (t === 'bend') {
      // bend:target[,speed,curve]
      const targetNote = typeof p[0] === 'string' ? p[0] : String(p[0]);
      const midi = noteToMidi(targetNote);
      state.bendTarget = midi !== null ? midiToFreq(midi) : 0;
      state.bendRate   = typeof p[1] === 'number' ? p[1] : parseFloat(String(p[1] ?? '2'));
      if (isNaN(state.bendRate)) state.bendRate = 2;
      state.bendActive = state.bendTarget > 0;
    } else if (t === 'pitch_env') {
      // pitch_env:[values] inline — parse as pitchEnvMacro override
      if (p.length > 0) {
        const macro = parseMacro(p[0]);
        if (macro) {
          state.pitchEnvMacro = macro;
          state.pitchEnvState = makeMacroState();
        }
      }
    }
    // pan / gg:pan handled separately before this call
    void t; void noteName;
  }
}

// ─── Per-frame advancement (60 Hz) ───────────────────────────────────────────

/**
 * Advance macros and vibrato/tremolo LFOs by `frames` 60 Hz frames.
 * Returns { periodChanged, volumeChanged } to signal PSG register updates.
 */
function advanceFrames(
  state: ChannelSimState,
  frames: number,
): { periodChanged: boolean; volumeChanged: boolean; noiseRateChanged: boolean } {
  if (!state.active || frames <= 0) {
    return { periodChanged: false, volumeChanged: false, noiseRateChanged: false };
  }

  let periodChanged = false;
  let volumeChanged = false;
  let noiseRateChanged = false;

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

    // ── noise_rate_env ────────────────────────────────────────────────────────
    if (state.noiseRateEnvMacro) {
      const newRate = Math.max(0, Math.min(3, Math.round(macroValue(state.noiseRateEnvMacro, state.noiseRateEnvState))));
      if (newRate !== state.noiseRate) { state.noiseRate = newRate; noiseRateChanged = true; }
      advanceMacro(state.noiseRateEnvMacro, state.noiseRateEnvState);
    }

    // ── vibrato LFO ───────────────────────────────────────────────────────────
    state.vibFrame++;
    if (state.vibDepth > 0 && state.vibRate > 0 && state.vibFrame > state.vibDelay) {
      const phase = (state.vibFrame - state.vibDelay) * state.vibRate / 60;
      const mod = Math.sin(2 * Math.PI * phase) * state.vibDepth;
      const newFreq = state.baseFreq * Math.pow(2, mod / 12);
      if (Math.abs(newFreq - state.freq) > 0.5) { state.freq = newFreq; periodChanged = true; }
    }

    // ── tremolo LFO ───────────────────────────────────────────────────────────
    if (state.tremoloDepth > 0 && state.tremoloRate > 0) {
      state.tremoloPhase += state.tremoloRate / 60;
      if (state.tremoloPhase > 1) state.tremoloPhase -= Math.floor(state.tremoloPhase);
      const mod = Math.sin(2 * Math.PI * state.tremoloPhase) * state.tremoloDepth;
      const baseAtt = state.volEnvMacro
        ? macroValue(state.volEnvMacro, { ...state.volEnvState })
        : (state.attenuation);
      const newAtt = Math.max(0, Math.min(15, Math.round(baseAtt + mod)));
      if (newAtt !== state.attenuation) { state.attenuation = newAtt; volumeChanged = true; }
    }

    // ── portamento ────────────────────────────────────────────────────────────
    if (state.portActive && state.portTarget > 0) {
      const diff = 12 * Math.log2(state.portTarget / Math.max(1, state.freq));
      if (Math.abs(diff) < 0.1) {
        state.freq = state.portTarget;
        state.portActive = false;
        periodChanged = true;
      } else {
        const step = Math.sign(diff) * Math.min(Math.abs(diff), state.portRate / 60);
        state.freq = state.freq * Math.pow(2, step / 12);
        periodChanged = true;
      }
    }

    // ── bend ──────────────────────────────────────────────────────────────────
    if (state.bendActive && state.bendTarget > 0) {
      const diff = 12 * Math.log2(state.bendTarget / Math.max(1, state.freq));
      if (Math.abs(diff) < 0.1) {
        state.freq = state.bendTarget;
        state.bendActive = false;
        periodChanged = true;
      } else {
        const step = Math.sign(diff) * Math.min(Math.abs(diff), state.bendRate / 60);
        state.freq = state.freq * Math.pow(2, step / 12);
        periodChanged = true;
      }
    }

  }

  return { periodChanged, volumeChanged, noiseRateChanged };
}

/**
 * Calculate the effective attenuation for a channel, considering:
 * 1. Base instrument volume
 * 2. vol_env macro (absolute values)
 * 3. Tremolo/trem (additive to base)
 * 4. Cut effect (mute)
 * 5. Rest/inactive (mute)
 *
 * Precedence: inactive → cut → (vol_env OR base vol) + trem
 */
function calcEffectiveAttenuation(state: ChannelSimState, isActive: boolean): number {
  if (!isActive) return ATTENUATION_MUTE;
  if (state.cutDone) return ATTENUATION_MUTE;

  // vol_env takes precedence; otherwise use base attenuation
  let att = state.attenuation;

  // Tremolo is additive but clamped
  if (state.tremoloDepth > 0 && state.tremoloRate > 0) {
    const phase = state.tremoloPhase;
    const mod = Math.sin(2 * Math.PI * phase) * state.tremoloDepth;
    att = Math.max(0, Math.min(15, Math.round(att + mod)));
  }

  return att;
}

/**
 * Emit PSG register writes for a given channel at per-tick final stage.
 * Consolidates noise control, period, and volume writes into one place.
 */
function emitChannelTickFinalWrites(
  ci: number,
  channels: ChannelModelLike[],
  simStates: ChannelSimState[],
  psg: SN76489State,
  clock: number,
  dataBytes: number[],
): void {
  const state = simStates[ci];
  const psgCh = channelIdToPsg(channels[ci].id);
  const isActive = state.active;

  if (isNoiseChannel(psgCh)) {
    // Noise: emit noise control, then volume
    if (isActive) {
      const noiseBytes = psg.applyNoiseControl(state.noiseIsWhite, state.noiseRate);
      for (const b of noiseBytes) {
        dataBytes.push(CMD_PSG_WRITE, b);
      }
    }
    const effAtt = calcEffectiveAttenuation(state, isActive);
    const volBytes = psg.applyVolume(psgCh, effAtt);
    for (const b of volBytes) {
      dataBytes.push(CMD_PSG_WRITE, b);
    }
  } else {
    // Tone: emit period, then volume
    if (isActive && state.freq > 0) {
      const period = freqToPeriod(state.freq, clock);
      const periodBytes = psg.applyTonePeriod(psgCh, period);
      for (const b of periodBytes) {
        dataBytes.push(CMD_PSG_WRITE, b);
      }
    }
    const effAtt = calcEffectiveAttenuation(state, isActive);
    const volBytes = psg.applyVolume(psgCh, effAtt);
    for (const b of volBytes) {
      dataBytes.push(CMD_PSG_WRITE, b);
    }
  }
}

export interface IsmToVgmResult {
  /** Raw VGM data bytes (commands, not including the header or GD3 block). */
  dataBytes: number[];
  /** Total 44100 Hz sample count (sum of all wait commands). */
  totalSamples: number;
  /** True when any channel used the retrig effect (triggers GD3 warning). */
  hasRetrig: boolean;
  /** Clock frequency used (NTSC or PAL). */
  clock: number;
  /** Whether any gg:pan writes were found (indicates Game Gear target). */
  isGameGear: boolean;
}

/**
 * Translate a validated ISM (SongModel for chip=sms) into raw VGM data bytes.
 */
export function ismToVgm(song: SongLike): IsmToVgmResult {
  const bpm = song.bpm ?? 120;
  const tickSeconds = (60 / bpm) / 4;
  // Timing model: macros advance at 60 Hz (one step per video frame).
  // Total sample count per tick = VGM_SAMPLE_RATE * tickSeconds, but we
  // account for this by emitting one 735-sample wait per 60 Hz frame rather
  // than a single per-tick wait, keeping macro pacing aligned with the audio
  // engine (pcmRenderer drives applyEnvelope() at ~60 Hz).
  const framesPerTick = 60 * tickSeconds; // 60 Hz macro frames per tick

  // Determine clock from chipRegion
  const region = String(song.chipRegion ?? '').toLowerCase();
  const clock = region === 'pal' ? SN76489_CLOCK_PAL : SN76489_CLOCK_NTSC;

  const insts = (song.insts ?? {}) as Record<string, InstrumentNode>;
  const channels = song.channels;

  // Per-channel simulation state
  const numChannels = channels.length;
  const simStates: ChannelSimState[] = channels.map(() => makeChannelState());
  const channelDefaults: (string | undefined)[] = channels.map(ch => ch.defaultInstrument);

  // We step through all channels in tick-parallel order.
  const maxTicks = Math.max(...channels.map(ch => ch.events.length), 0);

  // Per-channel current note-on event reference (for retrig restart)
  const currentNoteEvents: (ChannelEventLike | null)[] = channels.map(() => null);
  const currentNoteNames: string[] = channels.map(() => '');

  // PSG shadow state
  const psg = new SN76489State();
  // GG stereo defaults: all channels C (both sides) = bits 11 per channel
  const ggPanBits: number[] = [0b11, 0b11, 0b11, 0b11];
  let isGameGear = false;

  const dataBytes: number[] = [];
  let totalSamples = 0;
  let hasRetrig = false;

  // ── Initial flush ────────────────────────────────────────────────────────────
  // Establish known PSG state at song start (all channels muted, periods = 0,
  // noise = periodic rate-1). VGMPlay starts from an undefined register state.
  const { psgBytes: initBytes, ggStereo: initStereo } = psg.flush();

  // Write initial GG stereo (0xFF = all channels on both sides)
  dataBytes.push(CMD_GG_STEREO, initStereo);
  // Write initial PSG register state
  for (const b of initBytes) {
    dataBytes.push(CMD_PSG_WRITE, b);
  }

  // ── Tick loop ─────────────────────────────────────────────────────────────────
  //
  // Correct ordering within each tick:
  //   1. Process events (note-on, rest) — updates channel sim state.
  //   2. Per-tick effects (cut, retrig).
  //   3. For each 60 Hz frame in this tick:
  //        a. Advance macros / LFOs by one frame → updates state.attenuation, state.freq.
  //        b. Emit GG stereo if changed.
  //        c. Emit PSG register writes for all channels (BEFORE the wait).
  //        d. Wait 735 samples.
  //
  // The critical fix vs. the previous implementation: PSG writes are emitted
  // BEFORE the wait, not after.  This ensures note-on events produce sound at
  // the tick boundary rather than after a full tick of silence.
  //
  // A global frame accumulator handles fractional framesPerTick so that the
  // total sample count stays accurate across the whole song.
  let globalFrameAccum = 0;

  for (let tick = 0; tick < maxTicks; tick++) {
    // 1. Process events for each channel at this tick
    for (let ci = 0; ci < numChannels; ci++) {
      const ch = channels[ci];
      if (tick >= ch.events.length) continue;

      const event: ChannelEventLike = ch.events[tick];
      const psgCh = channelIdToPsg(ch.id);
      const state = simStates[ci];

      if (event.type === 'note' || event.type === 'named') {
        const noteEvent = event;
        const inst = resolveInstrument(noteEvent, insts, channelDefaults[ci]);
        const noteName: string =
          event.type === 'note'
            ? (noteEvent.token ?? 'C4')
            : (noteEvent.defaultNote ?? 'C4');

        // Store for retrig
        currentNoteEvents[ci] = noteEvent;
        currentNoteNames[ci]  = noteName;

        // Note-on
        noteOn(state, noteName, inst, psgCh, clock);

        // GG stereo: read from instrument (or event pan)
        const panBits = readGenericPan(inst, noteEvent.pan ?? null);
        if (panBits !== null) {
          if (panBits !== ggPanBits[psgCh]) isGameGear = true;
          ggPanBits[psgCh] = panBits;
        }
        state.ggPanBits = ggPanBits[psgCh];

        // Parse inline effects
        if (noteEvent.effects && noteEvent.effects.length > 0) {
          parseEffectsOnNoteOn(
            noteEvent.effects as Effect[],
            state,
            noteName,
            clock,
            tickSeconds,
          );
          // Check for retrig
          if (noteEvent.effects.some((e: { type: string }) => e.type.toLowerCase() === 'retrig')) {
            hasRetrig = true;
          }
        }
      } else if (event.type === 'rest') {
        state.active = false;
        state.freq = 0;
        currentNoteEvents[ci] = null;
        currentNoteNames[ci]  = '';
      }
      // 'sustain' — continue current note; no state change needed
    }

    // 2. Per-tick effects (cut, retrig) — evaluated at the tick boundary,
    //    before any frames are emitted for this tick.
    for (let ci = 0; ci < numChannels; ci++) {
      const state = simStates[ci];
      if (!state.active) continue;
      const psgCh = channelIdToPsg(channels[ci].id);

      // cut effect — mute at specific tick within the note
      if (state.cutTick >= 0 && !state.cutDone) {
        if (state.retrigTick >= state.cutTick) {
          state.attenuation = ATTENUATION_MUTE;
          state.cutDone = true;
        }
      }

      // retrig effect — re-trigger every N ticks
      if (state.retrigInterval > 0) {
        if (state.retrigTick > 0 && state.retrigTick % state.retrigInterval === 0) {
          const noteEvent = currentNoteEvents[ci];
          if (noteEvent) {
            const savedInterval = state.retrigInterval;
            const inst = resolveInstrument(noteEvent, insts, channelDefaults[ci]);
            const noteName = currentNoteNames[ci];
            noteOn(state, noteName, inst, psgCh, clock);
            state.retrigInterval = savedInterval;
          }
        }
      }

      state.retrigTick++;
    }

    // 3. Per-frame loop — advance macros, then emit, then wait.
    //
    // The frame accumulator converts the floating-point framesPerTick into
    // an integer frame count per tick so that the sample total stays accurate.
    globalFrameAccum += framesPerTick;
    const framesThisTick = Math.floor(globalFrameAccum);
    globalFrameAccum -= framesThisTick;

    for (let f = 0; f < framesThisTick; f++) {
      // 3a. Advance macros / LFOs by one 60 Hz frame.
      //     This updates state.attenuation and state.freq before the emit.
      for (let ci = 0; ci < numChannels; ci++) {
        const state = simStates[ci];
        if (!state.active) continue;
        advanceFrames(state, 1);
      }

      // 3b. Emit GG stereo if the register changed.
      const newGgStereo = buildGgStereoByte(ggPanBits);
      const ggDirty = psg.applyGgStereo(newGgStereo);
      if (ggDirty >= 0) {
        dataBytes.push(CMD_GG_STEREO, ggDirty);
      }

      // 3c. Emit PSG register writes for all channels (BEFORE the wait).
      for (let ci = 0; ci < numChannels; ci++) {
        emitChannelTickFinalWrites(ci, channels, simStates, psg, clock, dataBytes);
      }

      // 3d. Wait one 60 Hz frame (735 samples at 44100 Hz).
      appendWait(dataBytes, SAMPLES_PER_60HZ);
      totalSamples += SAMPLES_PER_60HZ;
    }
  }

  // Final mute all channels
  for (let psgCh = 0; psgCh < 4; psgCh++) {
    const muteBytes = psg.applyVolume(psgCh, ATTENUATION_MUTE);
    for (const b of muteBytes) {
      dataBytes.push(CMD_PSG_WRITE, b);
    }
  }

  // End of data marker
  dataBytes.push(0x66);

  return { dataBytes, totalSamples, hasRetrig, clock, isGameGear };
}
