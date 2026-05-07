/**
 * @beatbax/plugin-chip-nes — NES Ricoh 2A03 APU chip plugin.
 *
 * Provides five audio channels:
 *   0 → Pulse 1    (duty, envelope, hardware sweep)
 *   1 → Pulse 2    (duty, envelope, hardware sweep)
 *   2 → Triangle   (fixed waveform, linear counter)
 *   3 → Noise      (15-bit LFSR, two modes)
 *   4 → DMC        (delta-modulation sample playback)
 *
 * Usage:
 * ```typescript
 * import { BeatBaxEngine } from '@beatbax/engine';
 * import nesPlugin from '@beatbax/plugin-chip-nes';
 *
 * const engine = new BeatBaxEngine();
 * engine.registerChipPlugin(nesPlugin);
 * ```
 *
 * In BeatBax scripts:
 * ```bax
 * chip nes
 * bpm 150
 * inst lead type=pulse1 duty=25 env=13,down env_period=2
 * ```
 */
import type { ChipPlugin, ChipChannelBackend } from '@beatbax/engine';
import type { InstrumentNode } from '@beatbax/engine';
import { version } from './version.js';
import { createPulseChannel } from './pulse.js';
import { createTriangleChannel } from './triangle.js';
import { createNoiseChannel } from './noise.js';
import { createDmcChannel, resolveRawDMCSample, preloadDMCSamples } from './dmc.js';
import { validateNesInstrument } from './validate.js';
import { BUNDLED_SAMPLES } from './dmcSamples.js';
import { nesUIContributions, CHIP_IMAGE_BASE64 } from './ui-contributions.js';
import { setNesClockRegion } from './periodTables.js';

const nesPlugin: ChipPlugin & { configureForSong(song: { chip?: string; chipRegion?: string }): void } = {
  name: 'nes',
  version,
  channels: 5,
  supportsPerChannelVolume: true,
  instrumentVolumeRange: { min: 0, max: 15 },

  supportsVolumeForChannel(channelIndex: number): boolean {
    // Pulse1 (0) and Pulse2 (1) have a hardware volume envelope register.
    // Noise (3) also has a volume envelope register.
    // Triangle (2) has no hardware volume control — always full amplitude.
    // DMC (4) volume is baked into the sample data; not adjustable at runtime.
    return channelIndex === 0 || channelIndex === 1 || channelIndex === 3;
  },

  bundledSamples: BUNDLED_SAMPLES,

  validateInstrument(inst: InstrumentNode) {
    return validateNesInstrument(inst);
  },

  createChannel(channelIndex: number, audioContext: BaseAudioContext): ChipChannelBackend {
    switch (channelIndex) {
      case 0: return createPulseChannel(audioContext, 'pulse1');
      case 1: return createPulseChannel(audioContext, 'pulse2');
      case 2: return createTriangleChannel(audioContext);
      case 3: return createNoiseChannel(audioContext);
      case 4: return createDmcChannel(audioContext);
      default: throw new Error(`NES plugin: invalid channel index ${channelIndex} (valid: 0–4)`);
    }
  },

  async resolveSampleAsset(ref: string): Promise<ArrayBuffer> {
    // Return the raw DMC byte stream; decoding happens inside the DMC backend.
    return resolveRawDMCSample(ref);
  },

  async preloadForPCM(insts: Record<string, import('@beatbax/engine').InstrumentNode>): Promise<void> {
    const refs = new Set<string>();
    for (const inst of Object.values(insts)) {
      if (typeof inst.dmc_sample === 'string') {
        refs.add(inst.dmc_sample);
      }
    }
    if (refs.size > 0) {
      await preloadDMCSamples(refs);
    }
  },

  uiContributions: nesUIContributions,
  newSongWizard: {
    metadata: {
      chipDisplayName: 'NES (Ricoh 2A03)',
      platform: 'Nintendo Entertainment System',
      year: '1983',
      channelSummary: '2 pulse, 1 triangle, 1 noise, 1 DMC',
      image: `data:image/png;base64,${CHIP_IMAGE_BASE64}`,
    },
    templates: {
      instruments: [
        {
          id: 'nes-basic',
          label: 'Basic lead + bass + drums',
          content: [
            'inst lead  type=pulse1 duty=25 env=12,down',
            'inst bass  type=pulse2 duty=50 env=10,down',
            'inst kick  type=noise env=14,down',
          ].join('\n'),
        },
        {
          id: 'nes-lead-only',
          label: 'Lead only',
          content: 'inst lead type=pulse1 duty=50 env=12,down',
        },
      ],
      effects: [
        {
          id: 'nes-common-fx',
          label: 'Vibrato + arpeggio',
          content: [
            'effect vibLead = vib:2,4,sine,2',
            'effect majArp = arp:4,7',
          ].join('\n'),
        },
        {
          id: 'nes-empty-fx',
          label: 'Empty',
          content: '',
        },
      ],
      structure: [
        {
          id: 'nes-simple-1ch',
          label: 'Single channel melody',
          content: [
            'pat melody = C5 E5 G5 C6',
            'seq main = melody melody:oct(-1)',
            'channel 1 => inst lead seq main',
            'play',
          ].join('\n'),
        },
        {
          id: 'nes-band-3ch',
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
            'channel 4 => inst kick seq drumSeq',
            'play',
          ].join('\n'),
        },
      ],
      defaults: {
        instruments: 'nes-basic',
        effects: 'nes-common-fx',
        structure: 'nes-band-3ch',
      },
    },
  },

  configureForSong(song: { chip?: string; chipRegion?: string }) {
    setNesClockRegion(song?.chipRegion);
  },

  async resolveExporterPlugins() {
    try {
      const mod = await import('@beatbax/plugin-exporter-famitracker');
      return [mod.famitrackerTextExporterPlugin];
    } catch {
      // @beatbax/plugin-exporter-famitracker is an optional peer — not installed.
      return [];
    }
  },
};

export default nesPlugin;
export { nesPlugin };

// Re-export useful utilities
export { PULSE_PERIOD, TRIANGLE_PERIOD, NOISE_PERIOD_TABLE, NOISE_PERIOD_TABLE_NTSC, NOISE_PERIOD_TABLE_PAL, DMC_RATE_TABLE, DMC_RATE_TABLE_NTSC, DMC_RATE_TABLE_PAL, NES_CLOCK_NTSC, NES_CLOCK_PAL, setNesClockRegion, getNesClockRegion } from './periodTables.js';
export {
  nesMix,
  getNesGainWeights,
  NES_MIX_GAIN,
  setNesWebAudioMixMode,
  getNesWebAudioMixMode,
  getNesWebAudioNorm,
  type NesWebAudioMixMode,
} from './mixer.js';
export { validateNesInstrument } from './validate.js';
export { decodeDMC, resolveDMCSample, resolveRawDMCSample, resolveGitHubUrl, preloadDMCSamples } from './dmc.js';
