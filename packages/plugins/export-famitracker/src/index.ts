import type { ExporterPlugin } from '@beatbax/engine';
import { SongLike } from './ftm-types.js';
import { version } from './version.js';
import { writeFtmText } from './ftm-text-writer.js';
import { writeFtmBinary } from './ftm-writer.js';

function ensureNes(song: Parameters<Required<ExporterPlugin>['export']>[0]): string[] {
  const chip = String((song as any)?.chip || 'gameboy').toLowerCase();
  return chip === 'nes' ? [] : [`FamiTracker exporters support only chip 'nes' (got '${chip}')`];
}

export const famitrackerBinaryExporterPlugin: ExporterPlugin = {
  id: 'famitracker',
  label: 'FamiTracker Binary',
  version,
  extension: 'ftm',
  mimeType: 'application/octet-stream',
  supportedChips: ['nes'],
  validate(song): string[] {
    return ensureNes(song);
  },
  export(song): Uint8Array {
    const errors = ensureNes(song);
    if (errors.length) throw new Error(errors.join('; '));
    return writeFtmBinary(song as unknown as SongLike);
  },
  uiContributions: {
    toolbarLabel: 'FTM',
    toolbarIcon: 'command-line',
  },
};

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
  export(song): string {
    const errors = ensureNes(song);
    if (errors.length) throw new Error(errors.join('; '));
    return writeFtmText(song as unknown as SongLike);
  },
  uiContributions: {
    toolbarLabel: 'FTXT',
    toolbarIcon: 'document-text',
  },
};

const famitrackerExporterPlugins: ExporterPlugin[] = [
  famitrackerBinaryExporterPlugin,
  famitrackerTextExporterPlugin,
];

export default famitrackerExporterPlugins;
