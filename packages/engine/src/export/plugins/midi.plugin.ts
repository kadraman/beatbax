import { buildMIDI, exportMIDI } from '../midiExport.js';
import type { ExporterPlugin } from '../types.js';

export const midiExporterPlugin: ExporterPlugin = {
  id: 'midi',
  label: 'MIDI (SMF)',
  version: '1.0.0',
  extension: 'mid',
  mimeType: 'audio/midi',
  supportedChips: ['*'],
  async export(song, options = {}) {
    if (!options.outputPath) {
      return buildMIDI(
        song,
        { duration: options.duration, channels: options.channels },
        { debug: options.debug, verbose: options.verbose },
      );
    }
    await exportMIDI(
      song,
      options.outputPath,
      { duration: options.duration, channels: options.channels },
      { debug: options.debug, verbose: options.verbose },
    );
  },
};
