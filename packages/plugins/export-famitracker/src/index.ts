import type { ExporterPlugin } from '@beatbax/engine';
import { SongLike } from './ftm-types.js';
import { version } from './version.js';
import { writeFtmText } from './ftm-text-writer.js';

function ensureNes(song: Parameters<Required<ExporterPlugin>['export']>[0]): string[] {
  const chip = String((song as any)?.chip || 'gameboy').toLowerCase();
  return chip === 'nes' ? [] : [`FamiTracker exporters support only chip 'nes' (got '${chip}')`];
}

export const famitrackerTextExporterPlugin: ExporterPlugin = {
  id: 'famitracker-text',
  label: 'FamiTracker Text',
  version,
  extension: 'txt',
  mimeType: 'text/plain',
  supportedChips: ['nes'],
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
