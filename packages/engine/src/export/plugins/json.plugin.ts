import { exportJSON } from '../jsonExport.js';
import type { ExporterPlugin } from '../types.js';

export const jsonExporterPlugin: ExporterPlugin = {
  id: 'json',
  label: 'JSON (ISM)',
  version: '1.0.0',
  extension: 'json',
  mimeType: 'application/json',
  supportedChips: ['*'],
  async export(song, options = {}) {
    if (!options.outputPath) {
      throw new Error(`Exporter 'json' requires an outputPath`);
    }
    await exportJSON(song, options.outputPath, { debug: options.debug, verbose: options.verbose });
  },
};
