/**
 * NES (Ricoh 2A03) APU — built-in chip plugin.
 *
 * Registered automatically by ChipRegistry alongside Game Boy.
 */
import type { ChipPlugin, ChipChannelBackend } from '../types.js';
import type { InstrumentNode } from '../../parser/ast.js';
import { version } from '../../version.js';
import { createPulseChannel } from './pulse.js';
import { createTriangleChannel } from './triangle.js';
import { createNoiseChannel } from './noise.js';
import { createDmcChannel, resolveRawDMCSample, preloadDMCSamples } from './dmc.js';
import { validateNesInstrument } from './validate.js';
import { BUNDLED_SAMPLES } from './dmcSamples.js';
import { nesUIContributions } from './ui-contributions.js';
import { setNesClockRegion } from './periodTables.js';
import { nesSongWizard } from './songWizard.js';

const nesPlugin: ChipPlugin & { configureForSong(song: { chip?: string; chipRegion?: string }): void } = {
  name: 'nes',
  aliases: ['famicom'],
  version,
  channels: 5,
  supportsPerChannelVolume: true,
  instrumentVolumeRange: { min: 0, max: 15 },
  bundledSamples: BUNDLED_SAMPLES,
  uiContributions: nesUIContributions,
  newSongWizard: nesSongWizard,

  supportsVolumeForChannel(channelIndex: number): boolean {
    return channelIndex === 0 || channelIndex === 1 || channelIndex === 3;
  },

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
    return resolveRawDMCSample(ref);
  },

  async preloadForPCM(insts: Record<string, InstrumentNode>): Promise<void> {
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

  configureForSong(song: { chip?: string; chipRegion?: string }) {
    setNesClockRegion(song?.chipRegion);
  },
};

export { nesPlugin };
