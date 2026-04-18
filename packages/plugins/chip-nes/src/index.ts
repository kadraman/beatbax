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
import { nesUIContributions } from './ui-contributions.js';

const nesPlugin: ChipPlugin = {
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
};

export default nesPlugin;
export { nesPlugin };

// Re-export useful utilities
export { PULSE_PERIOD, TRIANGLE_PERIOD, NOISE_PERIOD_TABLE, DMC_RATE_TABLE } from './periodTables.js';
export { nesMix, getNesGainWeights, NES_MIX_GAIN } from './mixer.js';
export { validateNesInstrument } from './validate.js';
export { decodeDMC, resolveDMCSample, resolveRawDMCSample, resolveGitHubUrl, preloadDMCSamples } from './dmc.js';
