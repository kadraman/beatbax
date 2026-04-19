import type { ExporterPlugin } from '@beatbax/engine';
import { version } from './version.js';

function toUint8Array(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function ensureNes(song: Parameters<Required<ExporterPlugin>['export']>[0]): string[] {
  const chip = String(song?.chip || 'gameboy').toLowerCase();
  return chip === 'nes' ? [] : [`FamiTracker exporters support only chip 'nes' (got '${chip}')`];
}

function placeholderHeader(song: Parameters<Required<ExporterPlugin>['export']>[0]): string {
  const title = String(song.metadata?.name || 'untitled');
  const bpm = Number(song.bpm ?? 120);
  const channels = Array.isArray(song.channels) ? song.channels.length : 0;
  return (
    `; BeatBax FamiTracker placeholder export\n` +
    `; chip=nes\n` +
    `; title=${title}\n` +
    `; bpm=${bpm}\n` +
    `; channels=${channels}\n`
  );
}

export const famitrackerBinaryExporterPlugin: ExporterPlugin = {
  id: 'famitracker',
  label: 'FamiTracker Binary (.ftm)',
  version,
  extension: 'ftm',
  mimeType: 'application/octet-stream',
  supportedChips: ['nes'],
  validate(song): string[] {
    return ensureNes(song);
  },
  export(song): Uint8Array {
    const payload = placeholderHeader(song) + '; mode=binary-ftm\n';
    return toUint8Array(payload);
  },
  uiContributions: {
    toolbarLabel: 'FTM',
    toolbarIcon: 'command-line',
  },
};

export const famitrackerTextExporterPlugin: ExporterPlugin = {
  id: 'famitracker-text',
  label: 'FamiTracker Text (.txt)',
  version,
  extension: 'txt',
  mimeType: 'text/plain',
  supportedChips: ['nes'],
  validate(song): string[] {
    return ensureNes(song);
  },
  export(song): string {
    return placeholderHeader(song) + '; mode=text-export\n';
  },
};

const famitrackerExporterPlugins: ExporterPlugin[] = [
  famitrackerBinaryExporterPlugin,
  famitrackerTextExporterPlugin,
];

export default famitrackerExporterPlugins;
