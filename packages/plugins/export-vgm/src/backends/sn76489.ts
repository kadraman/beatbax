/**
 * VGM backend for the SN76489 PSG family.
 *
 * Implements the VgmBackend interface. Chip-agnostic simulation primitives
 * (pitch, macros, effects, frame advancement) are imported from channelSim.ts.
 * This file contains only SN76489-family logic:
 *
 *  - SN76489 period formula and 10-bit clamp
 *  - GG stereo register encoding
 *  - Noise channel handling (noiseIsWhite, noiseRate 0-3, noiseRateEnvMacro)
 *  - PSG register write emission
 *  - GD3 system name ("Sega Master System" / "Sega Game Gear")
 *
 * Output is byte-for-byte identical to the previous monolithic exporter.
 */

import type { InstrumentNode } from '@beatbax/engine';
import type { VgmBackend, SongLike, VgmTranslateResult } from './types.js';
import type { Gd3Fields } from '../gd3.js';
import type { VgmHeaderParams } from '../vgmWriter.js';
import { SN76489State, ATTENUATION_MUTE } from './sn76489State.js';
import { appendWait } from '../vgmWriter.js';
import {
  CMD_PSG_WRITE,
  CMD_GG_STEREO,
  SN76489_CLOCK_NTSC,
  SN76489_CLOCK_PAL,
  SAMPLES_PER_60HZ,
} from '../constants.js';
import { version } from '../version.js';
import {
  type BaseChannelSimState,
  type MacroState,
  type ParsedMacro,
  type Effect,
  makeBaseChannelState,
  makeMacroState,
  parseMacro,
  macroValue,
  advanceMacro,
  resolveInstrument,
  midiToFreqForNote,
  midiToFreq,
  noteToMidi,
  parseGenericEffectsOnNoteOn,
  advanceGenericFrames,
  calcTremoloAttenuation,
} from './channelSim.js';

// ─── SMS-specific pitch utilities ─────────────────────────────────────────────

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

// ─── SMS channel simulation state ─────────────────────────────────────────────

/** SMS-specific extension of the base channel simulation state. */
interface ChannelSimState extends BaseChannelSimState {
  /** True = white noise, false = periodic noise. */
  noiseIsWhite: boolean;
  /** SN76489 noise rate 0–3 (3 = use Tone3 frequency). */
  noiseRate: number;
  /** Per-channel GG stereo pan bits (2-bit mask: bit0=L, bit1=R). */
  ggPanBits: number;
  /** SMS-specific noise rate envelope macro. */
  noiseRateEnvMacro: ParsedMacro | null;
  noiseRateEnvState: MacroState;
}

function makeChannelState(): ChannelSimState {
  return {
    ...makeBaseChannelState(ATTENUATION_MUTE),
    noiseIsWhite: true,
    noiseRate: 2,
    ggPanBits: 0b11, // C (both sides)
    noiseRateEnvMacro: null,
    noiseRateEnvState: makeMacroState(),
  };
}

function channelIdToPsg(channelId: number): number {
  return channelId - 1; // 1-based ISM id → 0-based PSG index
}

/** True when the PSG channel is the noise channel (index 3). */
function isNoiseChannel(psgCh: number): boolean {
  return psgCh === 3;
}

// ─── SMS instrument helpers ───────────────────────────────────────────────────

/** Read the `gg:pan` (or `gg_pan`) from an instrument node. */
function readGgPan(inst: InstrumentNode | null): number | null {
  if (!inst) return null;
  const ggPanVal = (inst as Record<string, unknown>)['gg:pan'] ?? (inst as Record<string, unknown>)['gg_pan'];
  if (ggPanVal !== undefined && ggPanVal !== null) {
    return panToBits(String(ggPanVal));
  }
  return null;
}

/** Snap a generic `pan` value (numeric or string) to GG bits. */
function readGenericPan(inst: InstrumentNode | null, eventPan: unknown): number | null {
  if (eventPan && typeof eventPan === 'object') {
    const pan = eventPan as Record<string, unknown>;
    if (pan['enum']) return panToBits(String(pan['enum']));
    if (typeof pan['value'] === 'number') return numericPanToBits(pan['value'] as number);
  }
  if (inst) {
    const instPan = (inst as Record<string, unknown>)['pan'];
    if (typeof instPan === 'number') return numericPanToBits(instPan);
    if (instPan !== undefined && instPan !== null) return panToBits(String(instPan));
  }
  const ggPan = readGgPan(inst);
  if (ggPan !== null) return ggPan;
  return null;
}

// ─── SMS note-on ──────────────────────────────────────────────────────────────

function noteOn(
  state: ChannelSimState,
  noteName: string,
  inst: InstrumentNode | null,
  psgCh: number,
  _clock: number,
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

  // Frequency
  const freq = midiToFreqForNote(noteName);
  state.freq = freq;
  state.baseFreq = freq;

  if (inst) {
    const defaultVolume = 8;
    const baseVolume = inst.vol !== undefined ? Number(inst.vol) : defaultVolume;
    state.attenuation = Math.max(0, Math.min(15, baseVolume));

    // SMS noise settings (channel 3 only)
    if (isNoiseChannel(psgCh)) {
      const mode = String(inst.noise_mode ?? 'white').toLowerCase();
      state.noiseIsWhite = mode !== 'periodic';
      const rawRate = inst.noise_rate !== undefined ? inst.noise_rate : 2;
      if (typeof rawRate === 'string' && rawRate.toLowerCase() === 'tone3') {
        state.noiseRate = 3;
      } else {
        state.noiseRate = Math.max(0, Math.min(3, Math.round(Number(rawRate))));
      }
    }

    // vol_env macro
    const volEnvM = parseMacro(inst.vol_env);
    state.volEnvMacro = volEnvM;
    state.volEnvState = makeMacroState();
    if (volEnvM && volEnvM.values.length > 0) {
      state.attenuation = Math.max(0, Math.min(15, volEnvM.values[0]));
    }

    if (!isNoiseChannel(psgCh)) {
      state.arpEnvMacro = parseMacro(inst.arp_env);
      state.arpEnvState = makeMacroState();
      state.pitchEnvMacro = parseMacro(inst.pitch_env);
      state.pitchEnvState = makeMacroState();
      state.noiseRateEnvMacro = null;
    } else {
      state.arpEnvMacro = null;
      state.pitchEnvMacro = null;
      state.noiseRateEnvMacro = parseMacro((inst as Record<string, unknown>)['noise_rate_env']);
      state.noiseRateEnvState = makeMacroState();
    }
  } else {
    state.volEnvMacro = null;
    state.arpEnvMacro = null;
    state.pitchEnvMacro = null;
    state.noiseRateEnvMacro = null;
  }

  // Reset generic effect state
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

// ─── SMS effect parsing ───────────────────────────────────────────────────────

function parseEffectsOnNoteOn(
  effects: Effect[],
  state: ChannelSimState,
  noteName: string,
  _clock: number,
  tickSeconds: number,
  framesPerTick: number,
): void {
  // Generic chip-agnostic effects
  parseGenericEffectsOnNoteOn(effects, state, noteName, tickSeconds, framesPerTick);

  // SMS-specific: noise_rate_env
  for (const eff of effects) {
    const t = eff.type.toLowerCase();
    if (t === 'noise_rate_env') {
      const p = eff.params;
      if (p.length > 0) {
        const macro = parseMacro(p[0]);
        if (macro) {
          state.noiseRateEnvMacro = macro;
          state.noiseRateEnvState = makeMacroState();
          state.noiseRate = Math.max(0, Math.min(3, Math.round(macro.values[0])));
        }
      }
    }
  }
}

// ─── SMS per-frame advancement (60 Hz) ────────────────────────────────────────

function advanceFrames(
  state: ChannelSimState,
  frames: number,
): { periodChanged: boolean; volumeChanged: boolean; noiseRateChanged: boolean } {
  if (!state.active || frames <= 0) {
    return { periodChanged: false, volumeChanged: false, noiseRateChanged: false };
  }

  // Delegate generic effects to shared module
  const { periodChanged, volumeChanged } = advanceGenericFrames(state, frames);

  let noiseRateChanged = false;

  // SMS-specific: noise_rate_env (runs for each frame, mirrors the generic loop)
  for (let f = 0; f < frames; f++) {
    if (state.noiseRateEnvMacro) {
      const newRate = Math.max(0, Math.min(3, Math.round(macroValue(state.noiseRateEnvMacro, state.noiseRateEnvState))));
      if (newRate !== state.noiseRate) { state.noiseRate = newRate; noiseRateChanged = true; }
      advanceMacro(state.noiseRateEnvMacro, state.noiseRateEnvState);
    }
  }

  return { periodChanged, volumeChanged, noiseRateChanged };
}

// ─── SMS effective attenuation ────────────────────────────────────────────────

function calcEffectiveAttenuation(state: ChannelSimState, isActive: boolean): number {
  if (!isActive) return ATTENUATION_MUTE;
  if (state.cutDone) return ATTENUATION_MUTE;
  // SN76489: 0=loudest, 15=mute → invertScale=false
  return calcTremoloAttenuation(state, state.attenuation, false);
}

// ─── SMS PSG register writes ──────────────────────────────────────────────────

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

const SN76489_ALIASES: readonly string[] = [
  'sms',
  'gamegear',
  'gg',
  'bbc_micro',
  'colecovision',
  'tandy_1000',
];

function normAlias(chip: string): string {
  return chip.toLowerCase().replace(/[\s_-]/g, '');
}

function isSn76489Chip(chip: string): boolean {
  const n = normAlias(chip);
  return SN76489_ALIASES.includes(n) || n.includes('sms') || n.includes('gamegear');
}

function isGameGearChip(chip: string | undefined): boolean {
  const n = normAlias(String(chip ?? ''));
  return n === 'gg' || n === 'gamegear';
}

// ─── SN76489 VGM Backend ──────────────────────────────────────────────────────

export const sn76489VgmBackend: VgmBackend = {
  chipAliases: SN76489_ALIASES,

  validate(song: SongLike): string[] {
    const errors: string[] = [];

    if (!song.chip || !isSn76489Chip(song.chip)) {
      errors.push(
        `VGM exporter only supports SN76489-family chips. Found chip=${JSON.stringify(song.chip)}.`
      );
    }

    if (song.channels.length === 0) {
      errors.push('Song has no channels.');
    }

    if (song.channels.length > 4) {
      errors.push(
        `SN76489 PSG has 4 channels but ${song.channels.length} channels are defined.`
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

    const currentNoteEvents: ({
      instrument?: string;
      instProps?: Record<string, unknown>;
      effects?: Effect[];
      pan?: unknown;
    } | null)[] = channels.map(() => null);
    const currentNoteNames: string[] = channels.map(() => '');

    const psg = new SN76489State();
    const ggPanBits: number[] = [0b11, 0b11, 0b11, 0b11];
    let isGameGear = isGameGearChip(song.chip);

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
      // 1. Process events
      for (let ci = 0; ci < numChannels; ci++) {
        const ch = channels[ci];
        if (tick >= ch.events.length) continue;

        const event = ch.events[tick];
        const psgCh = channelIdToPsg(ch.id);
        const state = simStates[ci];

        if (event.type === 'note' || event.type === 'named') {
          const noteEvent = event;
          const inst = resolveInstrument(
            noteEvent as { instrument?: string; instProps?: Record<string, unknown> },
            insts,
            channelDefaults[ci],
          );
          const noteName: string =
            event.type === 'note'
              ? (noteEvent.token ?? 'C4')
              : (noteEvent.defaultNote ?? 'C4');

          currentNoteEvents[ci] = noteEvent as {
            instrument?: string;
            instProps?: Record<string, unknown>;
            effects?: Effect[];
            pan?: unknown;
          };
          currentNoteNames[ci] = noteName;

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
          currentNoteNames[ci] = '';
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

// Backward-compatible alias for older imports.
export const smsVgmBackend = sn76489VgmBackend;
