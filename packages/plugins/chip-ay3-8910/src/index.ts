import type { ChipPlugin, ChipChannelBackend, InstrumentNode } from '@beatbax/engine';
import { version } from './version.js';
import { createAyChannel } from './channels.js';
import { validateAyInstrument } from './validate.js';
import { ayUIContributions } from './ui-contributions.js';
import { aySongWizard } from './songWizard.js';

type AyChipPlugin = ChipPlugin & {
  aliases?: readonly string[];
  configureForSong(song: { chip?: string; chipRegion?: string }): void;
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

  configureForSong(_song: { chip?: string; chipRegion?: string }) {
    // Reserved for future region-specific clocking in live playback.
  },

  createChannel(_channelIndex: number, audioContext: BaseAudioContext): ChipChannelBackend {
    return createAyChannel(audioContext);
  },

  async resolveExporterPlugins() {
    try {
      const exporterModuleId = '@beatbax/plugin-exporter-vgm';
      const mod = await import(exporterModuleId);
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
