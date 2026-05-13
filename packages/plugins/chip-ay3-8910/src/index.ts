import type { ChipPlugin, ChipChannelBackend, InstrumentNode } from '@beatbax/engine';
import { version } from './version.js';
import { applyAyConfig, createAyChannel, createAySharedContext } from './channels.js';
import { validateAyInstrument } from './validate.js';
import { ayUIContributions } from './ui-contributions.js';
import { aySongWizard } from './songWizard.js';
import type { AyDacMode } from './dac.js';

type AyChipPlugin = ChipPlugin & {
  aliases?: readonly string[];
  configureForSong(song: { chip?: string; chipRegion?: string }): void;
};

function resolveAyClock(alias?: string): number {
  const key = String(alias ?? '').toLowerCase();
  switch (key) {
    case 'zx-spectrum-128':
      return 1773400;
    case 'msx':
    case 'msx2':
      return 1789772;
    case 'atari-st':
    case 'ym2149':
      return 2000000;
    case 'amstrad-cpc':
      return 1000000;
    case 'vectrex':
      return 1500000;
    default:
      return 1773400;
  }
}

function resolveDacMode(alias?: string): AyDacMode {
  const key = String(alias ?? '').toLowerCase();
  return key === 'ym2149' || key === 'atari-st' ? 'ym' : 'ay';
}

const sharedContexts = new Map<BaseAudioContext, ReturnType<typeof createAySharedContext>>();
let runtimeConfig = {
  chipClock: 1773400,
  dacMode: 'ay' as AyDacMode,
};

const ayPlugin: AyChipPlugin = {
  name: 'ay3-8910',
  aliases: ['ay', 'ym2149', 'atari-st', 'msx', 'amstrad-cpc', 'vectrex', 'zx-spectrum-128'],
  version,
  channels: 3,
  supportsPerChannelVolume: true,
  instrumentVolumeRange: { min: 0, max: 15 },
  uiContributions: ayUIContributions,
  newSongWizard: aySongWizard,

  validateInstrument(inst: InstrumentNode) {
    return validateAyInstrument(inst);
  },

  configureForSong(song: { chip?: string; chipRegion?: string }) {
    runtimeConfig = {
      chipClock: resolveAyClock(song.chip),
      dacMode: resolveDacMode(song.chip),
    };

    for (const shared of sharedContexts.values()) {
      applyAyConfig(shared, runtimeConfig);
    }
  },

  createChannel(channelIndex: number, audioContext: BaseAudioContext): ChipChannelBackend {
    let shared = sharedContexts.get(audioContext);
    if (!shared) {
      shared = createAySharedContext(runtimeConfig);
      sharedContexts.set(audioContext, shared);
    }
    const ch = Math.max(0, Math.min(2, channelIndex)) as 0 | 1 | 2;
    return createAyChannel(ch, shared);
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
};

export default ayPlugin;
export { ayPlugin };
export { validateAyInstrument } from './validate.js';
export type { AyEnvelopeShape } from './envelope.js';
