/**
 * @beatbax/plugin-chip-sms — Sega Master System / Game Gear SN76489 PSG chip plugin.
 *
 * Provides four audio channels:
 *   0 → Tone1    (square wave, 50% duty, 10-bit period)
 *   1 → Tone2    (square wave, 50% duty, 10-bit period)
 *   2 → Tone3    (square wave, 50% duty, 10-bit period)
 *   3 → Noise    (15-bit LFSR, white/periodic modes)
 *
 * Usage:
 * ```typescript
 * import { BeatBaxEngine } from '@beatbax/engine';
 * import smsPlugin from '@beatbax/plugin-chip-sms';
 *
 * const engine = new BeatBaxEngine();
 * engine.registerChipPlugin(smsPlugin);
 * ```
 *
 * In BeatBax scripts:
 * ```bax
 * chip sms
 * bpm 150
 * inst lead type=tone1 vol=10 vol_env=[15,12,9,6,3,0]
 * inst bass type=tone2 vol=12
 * inst kick type=noise noise_mode=white noise_rate=2 vol_env=[15,8,3,0]
 * channel 1 => inst lead seq melody
 * channel 2 => inst bass seq bassline
 * channel 3 => inst kick seq drums
 * play
 * ```
 */
import type { ChipPlugin, ChipChannelBackend, ChipUIContributions } from '@beatbax/engine';
import type { InstrumentNode } from '@beatbax/engine';
import { version } from './version.js';
import { createToneChannel } from './tone.js';
import { createNoiseChannel } from './noise.js';
import { validateSmsInstrument, SMS_TYPES } from './validate.js';
import { smsUIContributions } from './ui-contributions.js';
import { smsVolSlideEffect } from './volSlide.js';
import { setSmsClockRegion } from './periodTables.js';

const smsPlugin: ChipPlugin & { configureForSong(song: { chip?: string; chipRegion?: string }): void } = {
  name: 'sms',
  version,
  channels: 4,
  supportsPerChannelVolume: true,
  instrumentVolumeRange: { min: 0, max: 15, isAttenuation: true }, // 0=loudest, 15=silent

  validateInstrument(inst: InstrumentNode) {
    return validateSmsInstrument(inst);
  },

  effects: {
    volSlide: smsVolSlideEffect,
  },

  configureForSong(song: { chip?: string; chipRegion?: string }) {
    setSmsClockRegion(song?.chipRegion);
  },

  createChannel(channelIndex: number, audioContext: BaseAudioContext): ChipChannelBackend {
    switch (channelIndex) {
      case 0: return createToneChannel(audioContext, 'tone1', 0);
      case 1: return createToneChannel(audioContext, 'tone2', 1);
      case 2: return createToneChannel(audioContext, 'tone3', 2);
      case 3: return createNoiseChannel(audioContext);
      default: throw new Error(`SMS plugin: invalid channel index ${channelIndex} (valid: 0–3)`);
    }
  },

  uiContributions: smsUIContributions,
};

export default smsPlugin;
export { smsPlugin };

// Re-export useful utilities
export { SMS_TYPES } from './validate.js';
export {
  SMS_CLOCK,
  SMS_CLOCK_NTSC,
  SMS_CLOCK_PAL,
  setSmsClockRegion,
  getSmsClockRegion,
  type SmsClockRegion,
} from './periodTables.js';
export {
  setSmsWebAudioMixMode,
  getSmsWebAudioMixMode,
  getSmsWebAudioNorm,
  SMS_MIX_GAIN,
  type SmsWebAudioMixMode,
  ggPanToGains,
  applyStereoRouting,
  type GGPan,
} from './mixer.js';
export { SMSChannelCoordinator, smsCoordinator } from './scheduler.js';
export {
  VibratoEffect,
  PortamentoEffect,
  TremoloEffect,
  applyVibrato,
  applyPortamento,
  applyTremolo,
  applyNoiseVibrato,
} from './effects.js';
