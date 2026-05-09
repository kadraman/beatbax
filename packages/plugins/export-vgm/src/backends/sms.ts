/**
 * VGM backend for the Sega Master System / Game Gear SN76489 PSG.
 *
 * Implements the VgmBackend interface. All SMS-specific translation logic
 * (formerly in ismToVgm.ts and index.ts) lives here.
 *
 * Output is byte-for-byte identical to the previous monolithic exporter.
 */

import type { InstrumentNode } from '@beatbax/engine';
import type { VgmBackend, SongLike, VgmTranslateResult } from './types.js';
import type { Gd3Fields } from '../gd3.js';
import type { VgmHeaderParams } from '../vgmWriter.js';
import { SN76489State, GG_STEREO_DEFAULT, ATTENUATION_MUTE } from './psgState.js';
import { appendWait } from '../vgmWriter.js';
import {
  CMD_PSG_WRITE,
  CMD_GG_STEREO,
  SN76489_CLOCK_NTSC,
  SN76489_CLOCK_PAL,
  noiseControlByte,
  SAMPLES_PER_60HZ,
} from '../constants.js';
import { version } from '../version.js';

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

/** Note name → SN76489 period (0 if unparseable). */
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
 * VGM 0x4F layout:
 *   bits 0-3: right enable for channels 0-3
 *   bits 4-7: left enable for channels 0-3
 */
function buildGgStereoByte(pans: number[]): number {
  let byte = 0;
  for (let ch = 0; ch < 4 && ch < pans.length; ch++) {
    const panBits = pans[ch] & 0b11;
    const leftEnabled = (panBits & 0b01) !== 0;
    const rightEnabled = (panBits & 0b10) !== 0;
    if (rightEnabled) byte |= (1 << ch);
    if (leftEnabled) byte |= (1 << (ch + 4));
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
  /** Last note base frequency (for portamento start on the next note). */
  lastNoteFreq: number;
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
  vibDepth:     number;  // 0–15 intensity
  vibRate:      number;  // Hz
  vibDelay:     number;  // frames before vibrato starts
  vibFrame:     number;  // frames elapsed since note-on

  portTarget:   number;  // target frequency
  portStart:    number;  // start frequency at note-on
  portFrame:    number;  // elapsed frames inside portamento
  portDuration: number;  // total portamento frames
  portActive:   boolean;

  tremoloPhase: number;
  tremoloDepth: number;
  tremoloRate:  number;
  tremoloDelay: number;   // frames before tremolo starts
  tremoloDuration: number; // frames tremolo stays active; -1 = full note
  tremoloFrame: number;   // elapsed frames since note-on

  cutTick:      number;  // tick within note at which to cut; -1 = no cut
  cutDone:      boolean;

  retrigInterval: number; // ticks between retriggers; 0 = disabled
  retrigTick:     number; // tick counter within note

  bendStart:    number;  // starting frequency at bend start
  bendSemitones:number;  // total semitone offset
  bendCurve:    string;  // linear|exp|log|sine
  bendDelay:    number;  // delay before bend starts (frames)
  bendFrame:    number;  // elapsed bend frames (including delay)
  bendDuration: number;  // bend duration in frames
  bendActive:   boolean;

  volSlideDelta: number; // signed slide amount
  volSlideSteps: number; // optional stepped mode count (0 = smooth)

  noteFrames:    number; // planned note duration in 60Hz frames
  noteFrame:     number; // elapsed 60Hz frames since note-on
}

function makeChannelState(): ChannelSimState {
  return {
    active: false,
    freq: 0,
    baseFreq: 0,
    attenuation: ATTENUATION_MUTE,
    lastNoteFreq: 0,
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
    portTarget: 0, portStart: 0, portFrame: 0, portDuration: 0, portActive: false,
    tremoloPhase: 0, tremoloDepth: 0, tremoloRate: 0, tremoloDelay: 0, tremoloDuration: -1, tremoloFrame: 0,
    cutTick: -1, cutDone: false,
    retrigInterval: 0, retrigTick: 0,
    bendStart: 0, bendSemitones: 0, bendCurve: 'linear', bendDelay: 0, bendFrame: 0, bendDuration: 0, bendActive: false,
    volSlideDelta: 0, volSlideSteps: 0,
    noteFrames: 1, noteFrame: 0,
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
  event: { instrument?: string; instProps?: Record<string, any> },
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
  noteFrames: number,
): void {
  if (state.baseFreq > 0) {
    state.lastNoteFreq = state.baseFreq;
  }
  state.active = true;
  state.cutDone = false;
  state.vibFrame = 0;
  state.retrigTick = 0;
  state.noteFrames = Math.max(1, noteFrames);
  state.noteFrame = 0;

  // Frequency and period
  const freq = midiToFreqForNote(noteName);
  state.freq = freq;
  state.baseFreq = freq;

  // Volume / attenuation
  if (inst) {
    const defaultVolume = 8;
    let baseVolume;
    if (inst.vol !== undefined) {
      baseVolume = Number(inst.vol);
    } else {
      baseVolume = defaultVolume;
    }
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
  state.portTarget = 0;
  state.portStart = 0;
  state.portFrame = 0;
  state.portDuration = 0;
  state.portActive = false;
  state.tremoloPhase = 0;
  state.tremoloDepth = 0;
  state.tremoloRate = 0;
  state.tremoloDelay = 0;
  state.tremoloDuration = -1;
  state.tremoloFrame = 0;
  state.cutTick = -1;
  state.retrigInterval = 0;
  state.volSlideDelta = 0;
  state.volSlideSteps = 0;
  state.bendStart = state.baseFreq;
  state.bendSemitones = 0;
  state.bendCurve = 'linear';
  state.bendDelay = 0;
  state.bendFrame = 0;
  state.bendDuration = 0;
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
      const delaySec = typeof (eff as any).delaySec === 'number' ? (eff as any).delaySec : null;
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
      if ((eff as any).durationSec && Number.isFinite((eff as any).durationSec)) {
        portFrames = Math.max(1, Math.round(Number((eff as any).durationSec) * 60));
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
      if (typeof (eff as any).durationSec === 'number' && Number((eff as any).durationSec) > 0) {
        tremDurationFrames = Math.max(1, Math.round(Number((eff as any).durationSec) * 60));
      } else {
        const durationRows = p[3] !== undefined ? Number(p[3]) : 0;
        if (Number.isFinite(durationRows) && durationRows > 0) {
          tremDurationFrames = Math.max(1, Math.round(durationRows * framesPerTick));
        }
      }
      state.tremoloDuration = tremDurationFrames;

      let tremDelayFrames = 0;
      if (typeof (eff as any).delaySec === 'number' && Number((eff as any).delaySec) > 0) {
        tremDelayFrames = Math.max(0, Math.round(Number((eff as any).delaySec) * 60));
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
    } else if (t === 'noise_rate_env') {
      if (p.length > 0) {
        const macro = parseMacro(p[0]);
        if (macro) {
          state.noiseRateEnvMacro = macro;
          state.noiseRateEnvState = makeMacroState();
          state.noiseRate = Math.max(0, Math.min(3, Math.round(macro.values[0])));
        }
      }
    }
    void t; void noteName;
  }
}

// ─── Per-frame advancement (60 Hz) ───────────────────────────────────────────

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
      const sinVal = Math.sin(2 * Math.PI * phase);
      const amplitudeHz = state.vibDepth * state.baseFreq * state.baseFreq / 131072;
      const newFreq = state.baseFreq + sinVal * amplitudeHz;
      if (Math.abs(newFreq - state.freq) > 0.5) { state.freq = newFreq; periodChanged = true; }
    }

    // ── tremolo LFO phase advance ────────────────────────────────────────────
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

    // ── volume slide ─────────────────────────────────────────────────────────
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
        const bp = Math.max(0, Math.min(1, raw));
        let shaped = bp;
        if (state.bendCurve === 'exp' || state.bendCurve === 'exponential') {
          shaped = bp * bp;
        } else if (state.bendCurve === 'log' || state.bendCurve === 'logarithmic') {
          shaped = 1 - Math.pow(1 - bp, 2);
        } else if (state.bendCurve === 'sine' || state.bendCurve === 'sin') {
          shaped = (1 - Math.cos(Math.PI * bp)) / 2;
        }
        const newFreq = state.bendStart * Math.pow(2, (state.bendSemitones * shaped) / 12);
        if (Math.abs(newFreq - state.freq) > 0.5) {
          state.freq = newFreq;
          periodChanged = true;
        }
        if (bp >= 1) {
          state.bendActive = false;
        }
      }
      state.bendFrame++;
    }

    state.noteFrame++;
  }

  return { periodChanged, volumeChanged, noiseRateChanged };
}

function calcEffectiveAttenuation(state: ChannelSimState, isActive: boolean): number {
  if (!isActive) return ATTENUATION_MUTE;
  if (state.cutDone) return ATTENUATION_MUTE;

  let att = state.attenuation;

  if (state.tremoloDepth > 0 && state.tremoloRate > 0) {
    const activeStart = state.tremoloDelay;
    const activeEnd = state.tremoloDuration >= 0
      ? (state.tremoloDelay + state.tremoloDuration)
      : Number.POSITIVE_INFINITY;
    const tremActiveNow = state.tremoloFrame >= activeStart && state.tremoloFrame < activeEnd;

    if (tremActiveNow) {
      const baselineGain = Math.max(0, Math.min(1, 1 - (att / 15)));
      const modulationDepth = (Math.max(0, Math.min(15, state.tremoloDepth)) / 15) * 0.5;
      const lfo = Math.sin(2 * Math.PI * state.tremoloPhase);
      const tremGain = 1.0 + (lfo * modulationDepth);
      const effectiveGain = Math.max(0, Math.min(1, baselineGain * tremGain));
      att = Math.max(0, Math.min(15, Math.round((1 - effectiveGain) * 15)));
    }
  }

  return att;
}

function emitChannelTickFinalWrites(
  ci: number,
  channels: SongLike['channels'],
  simStates: ChannelSimState[],
  psg: SN76489State,
  clock: number,
  dataBytes: number[],
): void {
  const state = simStates[ci];
  const psgCh = channelIdToPsg(channels[ci].id);
  const isActive = state.active;

  if (isNoiseChannel(psgCh)) {
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

// ─── Chip alias normalisation helpers ────────────────────────────────────────

const SMS_ALIASES: readonly string[] = ['sms', 'gamegear', 'gg'];

function normAlias(chip: string): string {
  return chip.toLowerCase().replace(/[\s_-]/g, '');
}

function isSmsChip(chip: string): boolean {
  const n = normAlias(chip);
  return SMS_ALIASES.includes(n) || n.includes('sms') || n.includes('gamegear');
}

// ─── SMS VGM Backend ──────────────────────────────────────────────────────────

export const smsVgmBackend: VgmBackend = {
  chipAliases: SMS_ALIASES,

  validate(song: SongLike): string[] {
    const errors: string[] = [];

    if (!song.chip || !isSmsChip(song.chip)) {
      errors.push(
        `VGM exporter only supports chip=sms (SN76489 PSG). Found chip=${JSON.stringify(song.chip)}.`
      );
    }

    if (song.channels.length === 0) {
      errors.push('Song has no channels.');
    }

    if (song.channels.length > 4) {
      errors.push(
        `SMS has 4 PSG channels but ${song.channels.length} channels are defined.`
      );
    }

    return errors;
  },

  translate(song: SongLike): VgmTranslateResult {
    const bpm = song.bpm ?? 120;
    const tickSeconds = (60 / bpm) / 4;
    const framesPerTick = 60 * tickSeconds;

    const region = String(song.chipRegion ?? '').toLowerCase();
    const clock = region === 'pal' ? SN76489_CLOCK_PAL : SN76489_CLOCK_NTSC;

    const insts = (song.insts ?? {}) as Record<string, InstrumentNode>;
    const channels = song.channels;

    const numChannels = channels.length;
    const simStates: ChannelSimState[] = channels.map(() => makeChannelState());
    const channelDefaults: (string | undefined)[] = channels.map(ch => ch.defaultInstrument);

    const maxTicks = Math.max(...channels.map(ch => ch.events.length), 0);

    const currentNoteEvents: ({ instrument?: string; instProps?: Record<string, any>; effects?: any[]; pan?: any } | null)[] = channels.map(() => null);
    const currentNoteNames: string[] = channels.map(() => '');

    const psg = new SN76489State();
    const ggPanBits: number[] = [0b11, 0b11, 0b11, 0b11];
    let isGameGear = false;

    const dataBytes: number[] = [];
    let totalSamples = 0;
    let hasRetrig = false;

    // Initial flush
    const { psgBytes: initBytes, ggStereo: initStereo } = psg.flush();
    dataBytes.push(CMD_GG_STEREO, initStereo);
    for (const b of initBytes) {
      dataBytes.push(CMD_PSG_WRITE, b);
    }

    let globalFrameAccum = 0;

    for (let tick = 0; tick < maxTicks; tick++) {
      // 1. Process events for each channel
      for (let ci = 0; ci < numChannels; ci++) {
        const ch = channels[ci];
        if (tick >= ch.events.length) continue;

        const event = ch.events[tick];
        const psgCh = channelIdToPsg(ch.id);
        const state = simStates[ci];

        if (event.type === 'note' || event.type === 'named') {
          const noteEvent = event;
          const inst = resolveInstrument(noteEvent, insts, channelDefaults[ci]);
          const noteName: string =
            event.type === 'note'
              ? (noteEvent.token ?? 'C4')
              : (noteEvent.defaultNote ?? 'C4');

          currentNoteEvents[ci] = noteEvent;
          currentNoteNames[ci]  = noteName;

          let sustainCount = 0;
          for (let sj = tick + 1; sj < ch.events.length; sj++) {
            if (ch.events[sj].type === 'sustain') sustainCount++;
            else break;
          }
          const noteFrames = Math.max(1, Math.round((1 + sustainCount) * framesPerTick));
          noteOn(state, noteName, inst, psgCh, clock, noteFrames);

          const panBits = readGenericPan(inst, noteEvent.pan ?? null);
          if (panBits !== null) {
            if (panBits !== ggPanBits[psgCh]) isGameGear = true;
            ggPanBits[psgCh] = panBits;
          }
          state.ggPanBits = ggPanBits[psgCh];

          if (noteEvent.effects && noteEvent.effects.length > 0) {
            parseEffectsOnNoteOn(
              noteEvent.effects as Effect[],
              state,
              noteName,
              clock,
              tickSeconds,
              framesPerTick,
            );
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
        // 'sustain' — continue current note
      }

      // 2. Per-tick effects (cut, retrig)
      for (let ci = 0; ci < numChannels; ci++) {
        const state = simStates[ci];
        if (!state.active) continue;

        if (state.cutTick >= 0 && !state.cutDone) {
          if (state.retrigTick >= state.cutTick) {
            state.attenuation = ATTENUATION_MUTE;
            state.cutDone = true;
          }
        }

        if (state.retrigInterval > 0) {
          if (state.retrigTick > 0 && state.retrigTick % state.retrigInterval === 0) {
            const noteEvent = currentNoteEvents[ci];
            if (noteEvent) {
              const savedInterval = state.retrigInterval;
              const psgCh = channelIdToPsg(channels[ci].id);
              const inst = resolveInstrument(noteEvent, insts, channelDefaults[ci]);
              const noteName = currentNoteNames[ci];
              const savedNoteFrames = state.noteFrames;
              noteOn(state, noteName, inst, psgCh, clock, savedNoteFrames);
              state.retrigInterval = savedInterval;
            }
          }
        }

        state.retrigTick++;
      }

      // 3. Per-frame loop
      globalFrameAccum += framesPerTick;
      const framesThisTick = Math.floor(globalFrameAccum);
      globalFrameAccum -= framesThisTick;

      for (let f = 0; f < framesThisTick; f++) {
        for (let ci = 0; ci < numChannels; ci++) {
          const state = simStates[ci];
          if (!state.active) continue;
          advanceFrames(state, 1);
        }

        const newGgStereo = buildGgStereoByte(ggPanBits);
        const ggDirty = psg.applyGgStereo(newGgStereo);
        if (ggDirty >= 0) {
          dataBytes.push(CMD_GG_STEREO, ggDirty);
        }

        for (let ci = 0; ci < numChannels; ci++) {
          emitChannelTickFinalWrites(ci, channels, simStates, psg, clock, dataBytes);
        }

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

    return {
      dataBytes: new Uint8Array(dataBytes),
      totalSamples,
      hasRetrig,
      clock,
      isGameGear,
    };
  },

  buildGd3Fields(song: SongLike, result: VgmTranslateResult): Gd3Fields {
    const meta = song.metadata ?? {};
    const name   = meta.name   ?? '';
    const artist = meta.artist ?? '';
    const noteParts: string[] = [];
    if (meta.description) noteParts.push(meta.description);
    if (result.hasRetrig) {
      noteParts.push('[BeatBax] retrig effect used: SN76489 phase reset on period rewrite is emulation-dependent. Behaviour may differ between VGM players and real hardware.');
    }

    const systemName = result.isGameGear ? 'Sega Game Gear' : 'Sega Master System';

    return {
      trackTitleEn: String(name),
      gameNameEn:   String(name),
      systemNameEn: systemName,
      authorEn:     String(artist),
      date:         '',
      creator:      `BeatBax VGM Exporter v${version}`,
      notes:        noteParts.join(' '),
    };
  },

  headerParams(song: SongLike, result: VgmTranslateResult): VgmHeaderParams {
    const region = String(song.chipRegion ?? '').toLowerCase();
    const rate = region === 'pal' ? 50 : 60;
    return {
      sn76489Clock: result.clock,
      rate,
    };
  },
};
