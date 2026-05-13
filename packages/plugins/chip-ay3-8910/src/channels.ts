import type { ChipChannelBackend, InstrumentNode } from '@beatbax/engine';
import {
  parseMacro,
  makeMacroState,
  macroValue,
  advanceMacro,
  noteToMidi,
  midiToFreq,
  type ParsedMacro,
  type MacroState,
} from '@beatbax/engine';
import { AyChipEmulator } from './emulator.js';
import type { AyDacMode } from './dac.js';
import type { AyEnvelopeShape } from './envelope.js';
import { shouldUseEnvelope } from './instrument.js';

export type RegisterPatch = { r: number; v: number };

type AyChannelIndex = 0 | 1 | 2;

interface AyRuntimeConfig {
  chipClock: number;
  dacMode: AyDacMode;
}

interface AySharedContext {
  emulator: AyChipEmulator;
  config: AyRuntimeConfig;
  sampleCache: [Float32Array, Float32Array, Float32Array];
  emulatorCursor: number;
  renderCursor: [number, number, number];
  cacheChunk: number;
  clockAccumulator: number;
  sampleRate: number;
  mixerReg: number;
  startedPCM: boolean;
  workletNode: AudioWorkletNode | null;
  workletReady: Promise<AudioWorkletNode | null> | null;
  workletConnected: boolean;
}

interface AyChannelState {
  active: boolean;
  frequency: number;
  baseFrequency: number;
  toneEnabled: boolean;
  noiseEnabled: boolean;
  noiseRate: number;
  useEnvelope: boolean;
  volume: number;
  envShape: AyEnvelopeShape;
  envPeriodOverride?: number;
  volEnvMacro: ParsedMacro | null;
  volEnvState: MacroState;
  pitchEnvMacro: ParsedMacro | null;
  pitchEnvState: MacroState;
  arpEnvMacro: ParsedMacro | null;
  arpEnvState: MacroState;
  noiseRateEnvMacro: ParsedMacro | null;
  noiseRateEnvState: MacroState;
}

const PCM_PLUGIN_CHUNK = 512;

const ENV_SHAPE_TO_R13: Record<AyEnvelopeShape, number> = {
  none: 0,
  attack_decay: 14,
  attack_decay_repeat: 14,
  decay_only: 9,
  decay_repeat: 8,
  attack_only: 13,
  hold: 11,
  attack_hold: 13,
  decay_quick: 9,
  decay_hold_max: 11,
  attack_hold_max: 13,
  triangle_down_up: 10,
  triangle_up_down: 14,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function toTonePeriod(freq: number, chipClock: number): number {
  if (!Number.isFinite(freq) || freq <= 0) return 1;
  const period = Math.floor(chipClock / (16 * freq));
  return clamp(period, 1, 0x0fff);
}

function noteToEnvPeriod(noteName: string, chipClock: number): number | null {
  const midi = noteToMidi(noteName);
  if (midi == null) return null;
  const freq = midiToFreq(midi);
  if (!Number.isFinite(freq) || freq <= 0) return null;
  return clamp(Math.floor(chipClock / (256 * freq)), 0, 0xffff);
}

function buildRegisterPatches(channelIndex: AyChannelIndex, state: AyChannelState, chipClock: number): RegisterPatch[] {
  const toneFineReg = channelIndex * 2;
  const toneCoarseReg = toneFineReg + 1;
  const ampReg = 8 + channelIndex;

  const patches: RegisterPatch[] = [];
  const tonePeriod = toTonePeriod(state.frequency, chipClock);
  patches.push({ r: toneFineReg, v: tonePeriod & 0xff });
  patches.push({ r: toneCoarseReg, v: (tonePeriod >> 8) & 0x0f });

  patches.push({ r: 6, v: clamp(state.noiseRate, 0, 31) });

  const useEnvelope = state.useEnvelope;
  const fixedLevel = clamp(Math.round(state.volume), 0, 15);
  const ampRegValue = useEnvelope ? 0x10 : fixedLevel;
  patches.push({ r: ampReg, v: ampRegValue });

  if (useEnvelope) {
    patches.push({ r: 13, v: ENV_SHAPE_TO_R13[state.envShape] ?? 0 });
    if (state.envPeriodOverride !== undefined) {
      patches.push({ r: 11, v: state.envPeriodOverride & 0xff });
      patches.push({ r: 12, v: (state.envPeriodOverride >> 8) & 0xff });
    }
  }

  return patches;
}

function resetSharedPCM(shared: AySharedContext): void {
  shared.emulator.reset();
  shared.emulator.setDacMode(shared.config.dacMode);
  shared.emulatorCursor = 0;
  shared.renderCursor = [0, 0, 0];
  shared.clockAccumulator = 0;
  shared.sampleRate = 0;
  shared.sampleCache[0].fill(0);
  shared.sampleCache[1].fill(0);
  shared.sampleCache[2].fill(0);
  shared.mixerReg = 0;
}

function updateMixerBits(shared: AySharedContext, channelIndex: AyChannelIndex, toneOn: boolean, noiseOn: boolean): void {
  const toneBit = channelIndex;
  const noiseBit = channelIndex + 3;

  if (toneOn) shared.mixerReg &= ~(1 << toneBit);
  else shared.mixerReg |= (1 << toneBit);

  if (noiseOn) shared.mixerReg &= ~(1 << noiseBit);
  else shared.mixerReg |= (1 << noiseBit);

  shared.emulator.writeRegister(7, shared.mixerReg & 0x3f);
}

function writeChannelRegisters(shared: AySharedContext, channelIndex: AyChannelIndex, state: AyChannelState): void {
  const toneFineReg = channelIndex * 2;
  const toneCoarseReg = toneFineReg + 1;
  const ampReg = 8 + channelIndex;

  const tonePeriod = toTonePeriod(state.frequency, shared.config.chipClock);
  shared.emulator.writeRegister(toneFineReg, tonePeriod & 0xff);
  shared.emulator.writeRegister(toneCoarseReg, (tonePeriod >> 8) & 0x0f);

  shared.emulator.writeRegister(6, clamp(state.noiseRate, 0, 31));
  updateMixerBits(shared, channelIndex, state.toneEnabled, state.noiseEnabled);

  if (state.useEnvelope) {
    shared.emulator.writeRegister(ampReg, 0x10);
    shared.emulator.writeRegister(13, ENV_SHAPE_TO_R13[state.envShape] ?? 0);
    if (state.envPeriodOverride !== undefined) {
      shared.emulator.writeRegister(11, state.envPeriodOverride & 0xff);
      shared.emulator.writeRegister(12, (state.envPeriodOverride >> 8) & 0xff);
    }
  } else {
    shared.emulator.writeRegister(ampReg, clamp(Math.round(state.volume), 0, 15));
  }
}

function ensureRendered(shared: AySharedContext, endExclusive: number, sampleRate: number): void {
  if (endExclusive <= shared.emulatorCursor) return;

  const rate = Math.max(1, sampleRate);
  if (shared.sampleRate !== rate) {
    shared.sampleRate = rate;
  }

  const ratio = shared.config.chipClock / (8 * rate);
  for (let sampleIdx = shared.emulatorCursor; sampleIdx < endExclusive; sampleIdx += 1) {
    shared.clockAccumulator += ratio;
    while (shared.clockAccumulator >= 1) {
      shared.emulator.clock();
      shared.clockAccumulator -= 1;
    }

    const slot = sampleIdx % shared.cacheChunk;
    shared.sampleCache[0][slot] = shared.emulator.getChannelSample(0);
    shared.sampleCache[1][slot] = shared.emulator.getChannelSample(1);
    shared.sampleCache[2][slot] = shared.emulator.getChannelSample(2);
  }

  shared.emulatorCursor = endExclusive;
}

async function ensureWorkletNode(
  shared: AySharedContext,
  ctx: BaseAudioContext,
  destination: AudioNode,
): Promise<AudioWorkletNode | null> {
  if (shared.workletNode) {
    if (!shared.workletConnected) {
      shared.workletNode.connect(destination);
      shared.workletConnected = true;
    }
    return shared.workletNode;
  }

  if (!('audioWorklet' in ctx) || !(ctx as AudioContext).audioWorklet) {
    return null;
  }

  if (!shared.workletReady) {
    shared.workletReady = (async () => {
      // Use indirect eval so TS/Jest CJS transforms do not parse `import.meta` syntax.
      const metaUrl = (0, eval)('import.meta.url') as string;
      const moduleUrl = new URL('./ay3-worklet-processor.js', metaUrl).toString();
      await (ctx as AudioContext).audioWorklet.addModule(moduleUrl);
      const node = new AudioWorkletNode(ctx as AudioContext, 'beatbax-ay3-worklet', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      shared.workletNode = node;
      return node;
    })().catch(() => null);
  }

  const node = await shared.workletReady;
  if (!node) return null;

  if (!shared.workletConnected) {
    node.connect(destination);
    shared.workletConnected = true;
  }

  return node;
}

export function createAySharedContext(config: AyRuntimeConfig): AySharedContext {
  const emulator = new AyChipEmulator(config.dacMode);
  return {
    emulator,
    config,
    sampleCache: [
      new Float32Array(PCM_PLUGIN_CHUNK),
      new Float32Array(PCM_PLUGIN_CHUNK),
      new Float32Array(PCM_PLUGIN_CHUNK),
    ],
    emulatorCursor: 0,
    renderCursor: [0, 0, 0],
    cacheChunk: PCM_PLUGIN_CHUNK,
    clockAccumulator: 0,
    sampleRate: 0,
    mixerReg: 0,
    startedPCM: false,
    workletNode: null,
    workletReady: null,
    workletConnected: false,
  };
}

export function applyAyConfig(shared: AySharedContext, config: AyRuntimeConfig): void {
  shared.config = { ...config };
  shared.emulator.setDacMode(config.dacMode);
}

export function createAyChannel(
  channelIndex: AyChannelIndex,
  shared: AySharedContext,
): ChipChannelBackend {
  const state: AyChannelState = {
    active: false,
    frequency: 0,
    baseFrequency: 0,
    toneEnabled: true,
    noiseEnabled: false,
    noiseRate: 0,
    useEnvelope: false,
    volume: 15,
    envShape: 'none',
    envPeriodOverride: undefined,
    volEnvMacro: null,
    volEnvState: makeMacroState(),
    pitchEnvMacro: null,
    pitchEnvState: makeMacroState(),
    arpEnvMacro: null,
    arpEnvState: makeMacroState(),
    noiseRateEnvMacro: null,
    noiseRateEnvState: makeMacroState(),
  };

  function applyStateToRegisters(): void {
    writeChannelRegisters(shared, channelIndex, state);
  }

  function resetState(): void {
    state.active = false;
    state.frequency = 0;
    state.baseFrequency = 0;
    state.toneEnabled = true;
    state.noiseEnabled = false;
    state.noiseRate = 0;
    state.useEnvelope = false;
    state.volume = 15;
    state.envShape = 'none';
    state.envPeriodOverride = undefined;
    state.volEnvMacro = null;
    state.volEnvState = makeMacroState();
    state.pitchEnvMacro = null;
    state.pitchEnvState = makeMacroState();
    state.arpEnvMacro = null;
    state.arpEnvState = makeMacroState();
    state.noiseRateEnvMacro = null;
    state.noiseRateEnvState = makeMacroState();
    updateMixerBits(shared, channelIndex, false, false);
    shared.emulator.writeRegister(8 + channelIndex, 0);
  }

  return {
    reset(): void {
      resetState();
      if (channelIndex === 0) {
        shared.startedPCM = false;
        resetSharedPCM(shared);
      }
      if (shared.workletNode) {
        shared.workletNode.port.postMessage({ type: 'reset' });
      }
    },

    noteOn(frequency: number, instrument: InstrumentNode): void {
      const type = String(instrument.type ?? 'tone').toLowerCase();
      const requestedNoise = String(instrument.noise ?? 'off').toLowerCase() === 'on';
      const envShape = String(instrument.env ?? 'none').toLowerCase() as AyEnvelopeShape;

      state.active = true;
      state.frequency = Math.max(0, frequency);
      state.baseFrequency = state.frequency;
      state.toneEnabled = type !== 'noise';
      state.noiseEnabled = type === 'noise' || type === 'tone_noise' || requestedNoise;
      state.noiseRate = clamp(Number(instrument.noise_rate ?? 0), 0, 31);
      state.useEnvelope = shouldUseEnvelope(instrument);
      state.envShape = envShape;

      const parsedVol = Number(instrument.vol ?? 15);
      state.volume = clamp(Number.isFinite(parsedVol) ? parsedVol : 15, 0, 15);

      state.volEnvMacro = parseMacro((instrument as any).vol_env);
      state.volEnvState = makeMacroState();
      state.pitchEnvMacro = parseMacro((instrument as any).pitch_env);
      state.pitchEnvState = makeMacroState();
      state.arpEnvMacro = parseMacro((instrument as any).arp_env);
      state.arpEnvState = makeMacroState();
      state.noiseRateEnvMacro = parseMacro((instrument as any).noise_rate_env);
      state.noiseRateEnvState = makeMacroState();

      state.envPeriodOverride = undefined;
      if ((instrument as any).env_period !== undefined) {
        state.envPeriodOverride = clamp(Number((instrument as any).env_period), 0, 0xffff);
      } else if ((instrument as any).env_pitch !== undefined) {
        const period = noteToEnvPeriod(String((instrument as any).env_pitch), shared.config.chipClock);
        if (period !== null) state.envPeriodOverride = period;
      }

      if (channelIndex === 0 && !shared.startedPCM) {
        resetSharedPCM(shared);
        shared.startedPCM = true;
      }

      applyStateToRegisters();
    },

    noteOff(): void {
      state.active = false;
      shared.emulator.writeRegister(8 + channelIndex, 0);
      updateMixerBits(shared, channelIndex, false, false);
      if (shared.workletNode) {
        shared.workletNode.port.postMessage({
          type: 'noteOff',
          channel: channelIndex,
          scheduledTime: 0,
        });
      }
    },

    setFrequency(frequency: number): void {
      state.frequency = Math.max(0, frequency);
      state.baseFrequency = state.frequency;
      applyStateToRegisters();
    },

    applyEnvelope(): void {
      if (!state.active) return;

      if (state.volEnvMacro) {
        state.volume = clamp(macroValue(state.volEnvMacro, state.volEnvState), 0, 15);
        advanceMacro(state.volEnvMacro, state.volEnvState);
      }

      let semitoneOffset = 0;
      if (state.arpEnvMacro) {
        semitoneOffset += macroValue(state.arpEnvMacro, state.arpEnvState);
        advanceMacro(state.arpEnvMacro, state.arpEnvState);
      }
      if (state.pitchEnvMacro) {
        semitoneOffset += macroValue(state.pitchEnvMacro, state.pitchEnvState);
        advanceMacro(state.pitchEnvMacro, state.pitchEnvState);
      }

      if (semitoneOffset !== 0) {
        const tuned = state.baseFrequency * Math.pow(2, semitoneOffset / 12);
        state.frequency = Math.max(0, tuned);
      }

      if (state.noiseRateEnvMacro) {
        state.noiseRate = clamp(macroValue(state.noiseRateEnvMacro, state.noiseRateEnvState), 0, 31);
        advanceMacro(state.noiseRateEnvMacro, state.noiseRateEnvState);
      }

      applyStateToRegisters();
    },

    render(buffer: Float32Array, sampleRate: number): void {
      if (!state.active) return;

      const start = shared.renderCursor[channelIndex];
      const endExclusive = start + buffer.length;
      ensureRendered(shared, endExclusive, sampleRate);

      const minAvailable = Math.max(0, shared.emulatorCursor - shared.cacheChunk);
      for (let i = 0; i < buffer.length; i += 1) {
        const abs = start + i;
        if (abs < minAvailable) continue;
        const slot = abs % shared.cacheChunk;
        buffer[i] += shared.sampleCache[channelIndex][slot] ?? 0;
      }

      shared.renderCursor[channelIndex] = endExclusive;
    },

    createPlaybackNodes(
      ctx: BaseAudioContext,
      _freq: number,
      start: number,
      dur: number,
      instrument: InstrumentNode,
      _scheduler: any,
      destination: AudioNode,
    ): AudioNode[] | null {
      const type = String(instrument.type ?? 'tone').toLowerCase();
      const requestedNoise = String(instrument.noise ?? 'off').toLowerCase() === 'on';

      state.active = true;
      state.toneEnabled = type !== 'noise';
      state.noiseEnabled = type === 'noise' || type === 'tone_noise' || requestedNoise;
      state.noiseRate = clamp(Number(instrument.noise_rate ?? 0), 0, 31);
      state.useEnvelope = shouldUseEnvelope(instrument);
      state.envShape = String(instrument.env ?? 'none').toLowerCase() as AyEnvelopeShape;

      const parsedVol = Number(instrument.vol ?? 15);
      state.volume = clamp(Number.isFinite(parsedVol) ? parsedVol : 15, 0, 15);

      state.envPeriodOverride = undefined;
      if ((instrument as any).env_period !== undefined) {
        state.envPeriodOverride = clamp(Number((instrument as any).env_period), 0, 0xffff);
      } else if ((instrument as any).env_pitch !== undefined) {
        const period = noteToEnvPeriod(String((instrument as any).env_pitch), shared.config.chipClock);
        if (period !== null) state.envPeriodOverride = period;
      }

      const patches = buildRegisterPatches(channelIndex, state, shared.config.chipClock);

      void ensureWorkletNode(shared, ctx, destination).then((node) => {
        if (!node) return;
        node.port.postMessage({
          type: 'noteOn',
          channel: channelIndex,
          registers: patches,
          scheduledTime: start,
        });
        node.port.postMessage({
          type: 'noteOff',
          channel: channelIndex,
          scheduledTime: start + dur,
        });
      });

      if (shared.workletNode) {
        (shared.workletNode as any)._baseFreq = Math.max(1, state.baseFrequency || 440);
        return [shared.workletNode];
      }

      // No worklet support in this context; let engine fall back to PCM.
      return null;
    },
  };
}
