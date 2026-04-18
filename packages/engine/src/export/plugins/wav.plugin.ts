import { exportWAVFromSong } from '../wavWriter.js';
import type { ExporterPlugin } from '../types.js';

export const wavExporterPlugin: ExporterPlugin = {
  id: 'wav',
  label: 'WAV Audio',
  version: '1.0.0',
  extension: 'wav',
  mimeType: 'audio/wav',
  supportedChips: ['*'],
  async export(song, options = {}) {
    if (!options.outputPath) {
      throw new Error(`Exporter 'wav' requires an outputPath`);
    }
    await exportWAVFromSong(
      song,
      options.outputPath,
      {
        duration: options.duration,
        renderChannels: options.channels,
        sampleRate: options.sampleRate ?? 44100,
        bitDepth: options.bitDepth ?? 16,
        normalize: options.normalize === true,
      },
      { debug: options.debug, verbose: options.verbose },
    );
  },
};
