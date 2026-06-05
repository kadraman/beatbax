import type { ExporterPlugin } from '@beatbax/engine';
import type { SongLike } from './ftm-types.js';
import { version } from './version.js';
import { writeFtmText } from './ftm-text-writer.js';
import { ensureNesChip } from './nes-chip.js';

function ensureNes(song: Parameters<Required<ExporterPlugin>['export']>[0]): string[] {
  return ensureNesChip((song as { chip?: string })?.chip);
}

export const famitrackerTextExporterPlugin: ExporterPlugin = {
  id: 'famitracker-text',
  label: 'FamiTracker Text',
  version,
  extension: 'txt',
  mimeType: 'text/plain',
  supportedChips: ['nes', 'famicom'],
  validate(song): string[] {
    return ensureNes(song);
  },
  async export(song, options): Promise<string> {
    const errors = ensureNes(song);
    if (errors.length) throw new Error(errors.join('; '));
    return writeFtmText(song as unknown as SongLike, {
      resolveSampleAsset: (options as any)?.resolveSampleAsset,
      onWarn: (options as any)?.onWarn,
    });
  },
  uiContributions: {
    toolbarLabel: 'FTXT',
    toolbarIcon: 'document-text',
  },
};

const famitrackerExporterPlugins: ExporterPlugin[] = [
  famitrackerTextExporterPlugin,
];

export default famitrackerExporterPlugins;
