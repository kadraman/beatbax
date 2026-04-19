import { exportUGE } from '../ugeWriter.js';
import type { ExporterPlugin } from '../types.js';

export const ugeExporterPlugin: ExporterPlugin = {
  id: 'uge',
  label: 'hUGETracker UGE',
  version: '1.0.0',
  extension: 'uge',
  mimeType: 'application/octet-stream',
  supportedChips: ['gameboy', 'gb', 'dmg'],
  async export(song, options = {}) {
    if (!options.outputPath) {
      throw new Error(`Exporter 'uge' requires an outputPath (Node.js/CLI mode)`);
    }
    await exportUGE(song, options.outputPath, {
      debug: options.debug,
      verbose: options.verbose,
      strictGb: Boolean(options.strictGb),
    });
  },
};
