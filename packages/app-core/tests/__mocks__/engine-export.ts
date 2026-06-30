/** Jest mock for @beatbax/engine/export — avoids loading ESM dist in tests. */

export interface ExporterPlugin {
  id: string;
  label: string;
  version: string;
  extension: string;
  mimeType: string;
  supportedChips: string[];
  export(song: unknown, options?: Record<string, unknown>): Promise<unknown> | unknown;
  validate?(song: unknown): string[];
}

function stubPlugin(
  id: string,
  label: string,
  extension: string,
  mimeType: string,
  supportedChips: string[],
): ExporterPlugin {
  return {
    id,
    label,
    version: '1.0.0',
    extension,
    mimeType,
    supportedChips,
    async export() {
      if (id === 'json') return '{"version":1,"song":{}}';
      return new Uint8Array([0x01, 0x02, 0x03]);
    },
  };
}

export const jsonExporterPlugin = stubPlugin('json', 'JSON (ISM)', 'json', 'application/json', ['*']);
export const midiExporterPlugin = stubPlugin('midi', 'MIDI (SMF)', 'mid', 'audio/midi', ['*']);
export const ugeExporterPlugin = stubPlugin('uge', 'hUGETracker UGE', 'uge', 'application/octet-stream', ['gameboy', 'gb', 'dmg']);
export const wavExporterPlugin: ExporterPlugin = {
  ...stubPlugin('wav', 'WAV Audio', 'wav', 'audio/wav', ['*']),
  validate(song) {
    const channels = Array.isArray((song as { channels?: unknown[] })?.channels)
      ? (song as { channels: unknown[] }).channels
      : [];
    const hasEvents = channels.some(
      (ch) => Array.isArray((ch as { events?: unknown[] })?.events) && (ch as { events: unknown[] }).events.length > 0,
    );
    return hasEvents ? [] : ['Song has no audio events to export.'];
  },
};

export function normalizeExporterResult(result: unknown) {
  if (result === undefined || result === null) return null;
  if (typeof result === 'string') return { data: result };
  if (result instanceof Uint8Array) return { data: result };
  if (result instanceof ArrayBuffer) return { data: new Uint8Array(result) };
  if (typeof result === 'object' && result !== null && 'data' in result) {
    const payload = result as { data: string | Uint8Array | ArrayBuffer };
    if (typeof payload.data === 'string') return { data: payload.data };
    if (payload.data instanceof Uint8Array) return { data: payload.data };
    if (payload.data instanceof ArrayBuffer) return { data: new Uint8Array(payload.data) };
  }
  return null;
}

export function buildJSON() {
  return '{"version":1,"song":{}}';
}

export function buildMIDI() {
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64]);
}

export function buildWAV() {
  return new Uint8Array([0x52, 0x49, 0x46, 0x46]);
}

export async function buildWAVFromSong() {
  return new Uint8Array([0x52, 0x49, 0x46, 0x46]);
}

export function writeWAV() {
  return Buffer.from([0x52, 0x49, 0x46, 0x46]);
}
