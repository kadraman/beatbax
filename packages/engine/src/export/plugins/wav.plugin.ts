import { buildWAVFromSong, exportWAVFromSong } from '../wavWriter.js';
import type { ExporterPlugin } from '../types.js';

export const wavExporterPlugin: ExporterPlugin = {
  id: 'wav',
  label: 'WAV Audio',
  version: '1.0.0',
  extension: 'wav',
  mimeType: 'audio/wav',
  supportedChips: ['*'],
  validate(song) {
    const channels = Array.isArray(song.channels) ? song.channels : [];
    const hasEvents = channels.some((ch) => Array.isArray(ch?.events) && ch.events.length > 0);
    if (!hasEvents) return ['Song has no audio events to export.'];
    return [];
  },
  async export(song, options = {}) {
    const renderOptions = {
      duration: options.duration,
      renderChannels: options.channels,
      sampleRate: options.sampleRate ?? 44100,
      bitDepth: options.bitDepth ?? 16,
      normalize: options.normalize === true,
      resolveSampleAsset: options.resolveSampleAsset,
    };
    if (!options.outputPath) {
      return buildWAVFromSong(
        song,
        renderOptions,
        { debug: options.debug, verbose: options.verbose },
      );
    }
    await exportWAVFromSong(
      song,
      options.outputPath,
      renderOptions,
      { debug: options.debug, verbose: options.verbose },
    );
  },
};
