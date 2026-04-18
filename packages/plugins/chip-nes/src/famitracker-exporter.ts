import type { ExporterPlugin } from '@beatbax/engine';

function toUint8Array(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

export const famitrackerExporterPlugin: ExporterPlugin = {
  id: 'famitracker',
  label: 'FamiTracker (.ftm)',
  version: '0.1.0',
  extension: 'ftm',
  mimeType: 'application/octet-stream',
  supportedChips: ['nes'],
  validate(song): string[] {
    const chip = String(song?.chip || 'gameboy').toLowerCase();
    return chip === 'nes' ? [] : [`Exporter 'famitracker' only supports chip 'nes' (got '${chip}')`];
  },
  export(song): Uint8Array {
    const name = String(song.metadata?.name || 'untitled');
    const bpm = Number(song.bpm ?? 120);
    const channelCount = Array.isArray(song.channels) ? song.channels.length : 0;
    const placeholder =
      `; BeatBax placeholder FamiTracker export\n` +
      `; chip=nes\n` +
      `; title=${name}\n` +
      `; bpm=${bpm}\n` +
      `; channels=${channelCount}\n` +
      `; note: real .ftm binary export is not implemented yet.\n`;
    return toUint8Array(placeholder);
  },
  uiContributions: {
    toolbarLabel: 'FTM',
    toolbarIcon: 'command-line',
  },
};
