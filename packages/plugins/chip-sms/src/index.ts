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

const SMS_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 96">' +
    '<rect width="160" height="96" fill="#1a1a1a"/>' +
    '<rect x="12" y="16" width="136" height="64" rx="8" fill="#202020" stroke="#444"/>' +
    '<circle cx="42" cy="48" r="14" fill="#3a3a3a"/>' +
    '<rect x="72" y="32" width="58" height="8" rx="3" fill="#4a4a4a"/>' +
    '<rect x="72" y="46" width="58" height="8" rx="3" fill="#4a4a4a"/>' +
    '<rect x="72" y="60" width="30" height="8" rx="3" fill="#4a4a4a"/>' +
    '</svg>',
  );

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

  async resolveExporterPlugins() {
    try {
      const mod = await import('@beatbax/plugin-exporter-vgm');
      const plugin = mod.default ?? mod;
      return [plugin];
    } catch {
      return [];
    }
  },

  uiContributions: smsUIContributions,
  newSongWizard: {
    metadata: {
      chipDisplayName: 'SMS (SN76489)',
      platform: 'Sega Master System / Game Gear',
      year: '1985',
      channelSummary: '3 tone, 1 noise',
      image: SMS_IMAGE,
    },
    templates: {
      instruments: [
        {
          id: 'sms-basic',
          label: 'Lead + bass + noise',
          content: [
            'inst lead type=tone1 vol=8',
            'inst bass type=tone2 vol=10',
            'inst drum type=noise noise_mode=white noise_rate=2 vol=6',
          ].join('\n'),
        },
        {
          id: 'sms-minimal',
          label: 'Minimal lead',
          content: 'inst lead type=tone1 vol=9',
        },
      ],
      namedEffects: [
        {
          id: 'sms-common-fx',
          label: 'Vibrato + volSlide',
          content: [
            'effect vibLead = vib:2,3,sine,2',
            'effect fadeOut = volSlide:-5',
          ].join('\n'),
        },
        {
          id: 'sms-empty-fx',
          label: 'Empty',
          content: '',
        },
      ],
      structure: [
        {
          id: 'sms-simple-1ch',
          label: 'Single channel melody',
          content: [
            'pat melody = C5 E5 G5 C6',
            'seq main = melody melody:oct(-1)',
            'channel 1 => inst lead seq main',
            'play',
          ].join('\n'),
        },
        {
          id: 'sms-band-3ch',
          label: 'Three channel starter',
          content: [
            'pat leadA = C5 E5 G5 C6',
            'pat bassA = C3 . G2 .',
            'pat drumA = C2 . C2 .',
            'seq leadSeq = leadA leadA:oct(-1)',
            'seq bassSeq = bassA bassA',
            'seq drumSeq = drumA drumA',
            'channel 1 => inst lead seq leadSeq',
            'channel 2 => inst bass seq bassSeq',
            'channel 4 => inst drum seq drumSeq',
            'play',
          ].join('\n'),
        },
      ],
      defaults: {
        instruments: 'sms-basic',
        namedEffects: 'sms-common-fx',
        structure: 'sms-band-3ch',
      },
    },
  },
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
